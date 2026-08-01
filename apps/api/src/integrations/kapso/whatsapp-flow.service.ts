import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../../appointments/appointments.service';
import { SlotsService } from '../../scheduling/slots.service';
import { ClaimService } from '../../reassignment/claim.service';
import { KapsoClient, KapsoListRow, WA_LIMITS } from './kapso.client';
import { InboundMessage } from './kapso-webhook.types';

/**
 * Menú guiado de WhatsApp (sec 5.1 / 8.1). **No hay conversación libre**: todo
 * es botones o listas, y el estado del wizard vive en `WhatsappSession`
 * (`step` + `context`), no en la memoria del proceso.
 *
 * Formato de los ids de botón (contrato con el motor de reasignación):
 *   menu:book | menu:list | menu:cancel
 *   prof:<professionalId>
 *   svc:<serviceTypeId>
 *   slot:<índice dentro de context.slots>
 *   book:yes | book:no
 *   cxl:<appointmentId> | cxlok:<appointmentId> | cxlno
 *   claim:<appointmentId> | decline:<appointmentId>   ← los emite el motor
 *
 * Los ids `claim:` / `decline:` se atienden en cualquier paso del wizard: una
 * oferta del motor puede llegar en medio de otra cosa.
 */

/** TTL de la sesión del menú. Después de esto se arranca de cero. */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Cuántos días para adelante buscamos horarios. */
const SLOTS_HORIZON_DAYS = 21;
/** Cuántos horarios le mostramos al paciente (límite de filas de WhatsApp). */
const SLOTS_TO_OFFER = WA_LIMITS.MAX_LIST_ROWS;

export const STEP = {
  IDLE: 'IDLE',
  MAIN_MENU: 'MAIN_MENU',
  PICK_PROFESSIONAL: 'PICK_PROFESSIONAL',
  PICK_SERVICE: 'PICK_SERVICE',
  PICK_SLOT: 'PICK_SLOT',
  CONFIRM_BOOKING: 'CONFIRM_BOOKING',
  PICK_CANCEL: 'PICK_CANCEL',
  CONFIRM_CANCEL: 'CONFIRM_CANCEL',
} as const;

interface SessionContext {
  professionalId?: string;
  serviceTypeId?: string;
  /** slots ofrecidos, en el mismo orden en que se numeraron los botones */
  slots?: { startAt: string; endAt: string }[];
  /** turno elegido para cancelar */
  appointmentId?: string;
}

@Injectable()
export class WhatsappFlowService {
  private readonly logger = new Logger(WhatsappFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly kapso: KapsoClient,
    private readonly slots: SlotsService,
    private readonly appointments: AppointmentsService,
    private readonly claims: ClaimService,
  ) {}

  /** Punto de entrada desde el webhook. Nunca tira: loguea y sigue. */
  async handleInbound(msg: InboundMessage): Promise<void> {
    try {
      const account = await this.resolveAccount(msg.phoneNumberId);
      if (!account) {
        this.logger.warn(
          `Mensaje de ${msg.from} sin cuenta asociada (phone_number_id=${msg.phoneNumberId}); lo ignoramos`,
        );
        return;
      }

      const patient = await this.prisma.patient.findUnique({
        where: { phone: msg.from },
      });

      // Las respuestas a una oferta del motor no dependen del paso del wizard.
      if (msg.buttonId?.startsWith('claim:') || msg.buttonId?.startsWith('decline:')) {
        if (!patient) return this.sendRegistrationLink(msg.from);
        return this.handleOfferResponse(msg, patient.id);
      }

      // sec 5.1 punto 2: número no registrado → link de registro y listo.
      if (!patient) {
        await this.sendRegistrationLink(msg.from);
        return;
      }

      const session = await this.loadSession(account.id, msg.from);
      await this.dispatch({
        accountId: account.id,
        timezone: account.timezone,
        phone: msg.from,
        patientId: patient.id,
        step: session.step,
        context: session.context,
        buttonId: msg.buttonId,
      });
    } catch (err) {
      this.logger.error(
        `Error procesando el mensaje ${msg.externalId} de ${msg.from}: ${
          err instanceof Error ? err.stack ?? err.message : String(err)
        }`,
      );
    }
  }

  // ---------- Ruteo del wizard ----------

  private async dispatch(ctx: {
    accountId: string;
    timezone: string;
    phone: string;
    patientId: string;
    step: string;
    context: SessionContext;
    buttonId: string | null;
  }): Promise<void> {
    const { buttonId } = ctx;

    // Cualquier texto libre (o botón desconocido) vuelve al menú principal.
    if (!buttonId) return this.showMainMenu(ctx.accountId, ctx.phone);

    const [prefix, value] = splitButtonId(buttonId);

    switch (prefix) {
      case 'menu':
        if (value === 'book') return this.startBooking(ctx);
        if (value === 'list') return this.listMyAppointments(ctx);
        if (value === 'cancel') return this.startCancel(ctx);
        return this.showMainMenu(ctx.accountId, ctx.phone);

      case 'prof':
        return this.pickedProfessional(ctx, value);

      case 'svc':
        return this.pickedService(ctx, value);

      case 'slot':
        return this.pickedSlot(ctx, Number(value));

      case 'book':
        if (value === 'yes') return this.confirmBooking(ctx);
        await this.resetSession(ctx.accountId, ctx.phone);
        return this.showMainMenu(ctx.accountId, ctx.phone);

      case 'cxl':
        return this.pickedAppointmentToCancel(ctx, value);

      case 'cxlok':
        return this.confirmCancel(ctx, value);

      case 'cxlno':
        await this.resetSession(ctx.accountId, ctx.phone);
        return this.showMainMenu(ctx.accountId, ctx.phone);

      default:
        return this.showMainMenu(ctx.accountId, ctx.phone);
    }
  }

  // ---------- Menú principal ----------

  private async showMainMenu(accountId: string, phone: string): Promise<void> {
    await this.saveSession(accountId, phone, STEP.MAIN_MENU, {});
    await this.kapso.sendButtons(phone, '¿Qué querés hacer?', [
      { id: 'menu:book', title: 'Sacar turno' },
      { id: 'menu:list', title: 'Mis turnos' },
      { id: 'menu:cancel', title: 'Cancelar turno' },
    ]);
  }

  private async sendRegistrationLink(phone: string): Promise<void> {
    const url = `${this.webUrl()}/registro?phone=${encodeURIComponent(phone)}`;
    await this.kapso.sendText(
      phone,
      `¡Hola! Todavía no tenemos tus datos. Registrate acá y después escribinos de nuevo para sacar tu turno:\n${url}`,
    );
  }

  // ---------- Sacar turno ----------

  private async startBooking(ctx: FlowCtx): Promise<void> {
    const professionals = await this.prisma.professional.findMany({
      where: { accountId: ctx.accountId },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });

    if (professionals.length === 0) {
      await this.kapso.sendText(
        ctx.phone,
        'Por ahora no hay profesionales disponibles. Probá más tarde.',
      );
      return;
    }

    await this.saveSession(ctx.accountId, ctx.phone, STEP.PICK_PROFESSIONAL, {});
    await this.offer(
      ctx.phone,
      '¿Con quién querés el turno?',
      'Ver profesionales',
      professionals.map((p) => ({ id: `prof:${p.id}`, title: p.displayName })),
    );
  }

  private async pickedProfessional(ctx: FlowCtx, professionalId: string): Promise<void> {
    const services = await this.prisma.serviceType.findMany({
      where: { professionalId, active: true },
      select: { id: true, name: true, durationMinutes: true },
      orderBy: { name: 'asc' },
    });

    if (services.length === 0) {
      await this.kapso.sendText(
        ctx.phone,
        'Ese profesional no tiene servicios cargados todavía. Escribinos de nuevo para volver al menú.',
      );
      await this.resetSession(ctx.accountId, ctx.phone);
      return;
    }

    await this.saveSession(ctx.accountId, ctx.phone, STEP.PICK_SERVICE, {
      professionalId,
    });
    await this.offer(
      ctx.phone,
      '¿Qué consulta necesitás?',
      'Ver servicios',
      services.map((s) => ({
        id: `svc:${s.id}`,
        title: s.name,
        description: `${s.durationMinutes} min`,
      })),
    );
  }

  private async pickedService(ctx: FlowCtx, serviceTypeId: string): Promise<void> {
    const professionalId = ctx.context.professionalId;
    if (!professionalId) return this.showMainMenu(ctx.accountId, ctx.phone);

    const now = DateTime.now().setZone(ctx.timezone);
    const available = await this.slots.list({
      professionalId,
      serviceTypeId,
      from: now.toISO() ?? now.toISODate() ?? '',
      to: now.plus({ days: SLOTS_HORIZON_DAYS }).toISODate() ?? '',
    });

    if (available.length === 0) {
      await this.kapso.sendText(
        ctx.phone,
        'No nos quedan horarios libres en las próximas semanas. Si querés, anotate en la lista de espera desde la web y te avisamos apenas se libere uno.',
      );
      await this.resetSession(ctx.accountId, ctx.phone);
      return;
    }

    const offered = available.slice(0, SLOTS_TO_OFFER);
    await this.saveSession(ctx.accountId, ctx.phone, STEP.PICK_SLOT, {
      professionalId,
      serviceTypeId,
      slots: offered,
    });
    await this.offer(
      ctx.phone,
      'Estos son los horarios que tenemos. Elegí uno:',
      'Ver horarios',
      offered.map((s, i) => ({
        id: `slot:${i}`,
        title: formatSlot(s.startAt, ctx.timezone),
      })),
    );
  }

  private async pickedSlot(ctx: FlowCtx, index: number): Promise<void> {
    const slot = ctx.context.slots?.[index];
    if (!slot || !ctx.context.professionalId || !ctx.context.serviceTypeId) {
      return this.showMainMenu(ctx.accountId, ctx.phone);
    }

    await this.saveSession(ctx.accountId, ctx.phone, STEP.CONFIRM_BOOKING, {
      ...ctx.context,
      slots: [slot],
    });
    await this.kapso.sendButtons(
      ctx.phone,
      `¿Confirmamos el turno del ${formatSlotLong(slot.startAt, ctx.timezone)}?`,
      [
        { id: 'book:yes', title: 'Sí, confirmar' },
        { id: 'book:no', title: 'No, volver' },
      ],
    );
  }

  private async confirmBooking(ctx: FlowCtx): Promise<void> {
    const { professionalId, serviceTypeId } = ctx.context;
    const slot = ctx.context.slots?.[0];
    if (!professionalId || !serviceTypeId || !slot) {
      return this.showMainMenu(ctx.accountId, ctx.phone);
    }

    try {
      await this.appointments.create({
        expectedAccountId: ctx.accountId,
        professionalId,
        serviceTypeId,
        patientId: ctx.patientId,
        startAt: slot.startAt,
        origin: 'WHATSAPP',
      });
      await this.resetSession(ctx.accountId, ctx.phone);
      await this.kapso.sendText(
        ctx.phone,
        `¡Listo! Te esperamos el ${formatSlotLong(slot.startAt, ctx.timezone)}. Si no podés venir, avisanos por acá.`,
      );
    } catch (err) {
      this.logger.warn(
        `No pudimos crear el turno por WhatsApp para ${ctx.phone}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.resetSession(ctx.accountId, ctx.phone);
      await this.kapso.sendText(
        ctx.phone,
        'Uy, ese horario se ocupó justo. Escribinos de nuevo y elegimos otro.',
      );
    }
  }

  // ---------- Mis turnos / cancelar ----------

  private async myUpcoming(ctx: FlowCtx) {
    return this.prisma.appointment.findMany({
      where: {
        accountId: ctx.accountId,
        patientId: ctx.patientId,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startAt: { gt: new Date() },
      },
      select: {
        id: true,
        startAt: true,
        professional: { select: { displayName: true } },
        serviceType: { select: { name: true } },
      },
      orderBy: { startAt: 'asc' },
      take: WA_LIMITS.MAX_LIST_ROWS,
    });
  }

  private async listMyAppointments(ctx: FlowCtx): Promise<void> {
    const upcoming = await this.myUpcoming(ctx);
    await this.resetSession(ctx.accountId, ctx.phone);

    if (upcoming.length === 0) {
      await this.kapso.sendText(ctx.phone, 'No tenés turnos agendados.');
      return;
    }

    const lines = upcoming.map(
      (a) =>
        `• ${formatSlotLong(a.startAt.toISOString(), ctx.timezone)} — ${
          a.professional.displayName
        } (${a.serviceType.name})`,
    );
    await this.kapso.sendText(ctx.phone, `Tus turnos:\n${lines.join('\n')}`);
  }

  private async startCancel(ctx: FlowCtx): Promise<void> {
    const upcoming = await this.myUpcoming(ctx);

    if (upcoming.length === 0) {
      await this.resetSession(ctx.accountId, ctx.phone);
      await this.kapso.sendText(ctx.phone, 'No tenés turnos para cancelar.');
      return;
    }

    await this.saveSession(ctx.accountId, ctx.phone, STEP.PICK_CANCEL, {});
    await this.offer(
      ctx.phone,
      '¿Cuál querés cancelar?',
      'Ver turnos',
      upcoming.map((a) => ({
        id: `cxl:${a.id}`,
        title: formatSlot(a.startAt.toISOString(), ctx.timezone),
        description: `${a.professional.displayName} — ${a.serviceType.name}`,
      })),
    );
  }

  private async pickedAppointmentToCancel(
    ctx: FlowCtx,
    appointmentId: string,
  ): Promise<void> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: ctx.patientId },
      select: { id: true, startAt: true },
    });
    if (!appointment) return this.showMainMenu(ctx.accountId, ctx.phone);

    await this.saveSession(ctx.accountId, ctx.phone, STEP.CONFIRM_CANCEL, {
      appointmentId,
    });
    await this.kapso.sendButtons(
      ctx.phone,
      `¿Seguro que querés cancelar el turno del ${formatSlotLong(
        appointment.startAt.toISOString(),
        ctx.timezone,
      )}?`,
      [
        { id: `cxlok:${appointmentId}`, title: 'Sí, cancelar' },
        { id: 'cxlno', title: 'No' },
      ],
    );
  }

  private async confirmCancel(ctx: FlowCtx, appointmentId: string): Promise<void> {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, patientId: ctx.patientId },
      select: { id: true },
    });
    await this.resetSession(ctx.accountId, ctx.phone);

    if (!appointment) {
      await this.kapso.sendText(ctx.phone, 'No encontramos ese turno.');
      return;
    }

    await this.appointments.cancel(appointmentId, 'patient');
    await this.kapso.sendText(
      ctx.phone,
      'Listo, cancelamos tu turno. Gracias por avisar: se lo ofrecemos a alguien de la lista de espera.',
    );
  }

  // ---------- Respuesta a una oferta del motor (sec 6.4) ----------

  private async handleOfferResponse(
    msg: InboundMessage,
    patientId: string,
  ): Promise<void> {
    const [prefix, appointmentId] = splitButtonId(msg.buttonId ?? '');
    if (!appointmentId) return;

    if (prefix === 'decline') {
      await this.prisma.notificationLog.updateMany({
        where: { appointmentId, patientId, response: null },
        data: { response: 'DECLINED', respondedAt: new Date() },
      });
      await this.kapso.sendText(
        msg.from,
        'Listo, se lo ofrecemos a otra persona. Seguís en la lista de espera.',
      );
      return;
    }

    // Aceptar: el MISMO claim() que usa la web (sec 6.4). Nada de lógica propia.
    try {
      await this.claims.claim(appointmentId, patientId, 'whatsapp');
      await this.kapso.sendText(
        msg.from,
        '¡Genial, el turno es tuyo! Te lo confirmamos por acá.',
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        await this.kapso.sendText(
          msg.from,
          'Uy, ese turno ya lo tomó otra persona. Seguís en la lista de espera y te avisamos apenas se libere otro.',
        );
        return;
      }
      this.logger.error(
        `Error tomando el turno ${appointmentId} desde WhatsApp: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await this.kapso.sendText(
        msg.from,
        'No pudimos tomar el turno. Probá desde la web, por favor.',
      );
    }
  }

  // ---------- Resolución de cuenta (sec 5.1: un número por cuenta) ----------

  private async resolveAccount(phoneNumberId: string | null) {
    const businessNumber = phoneNumberId
      ? await this.kapso.businessNumberFor(phoneNumberId)
      : null;

    if (businessNumber) {
      return this.prisma.account.findFirst({
        where: { whatsappNumber: businessNumber },
        select: { id: true, timezone: true },
      });
    }

    // El sandbox de Kapso no expone `display_phone_number`. Si hay una sola
    // cuenta con número cargado, asumimos que es esa; con varias no adivinamos.
    const candidates = await this.prisma.account.findMany({
      where: { whatsappNumber: { not: null } },
      select: { id: true, timezone: true },
      take: 2,
    });
    if (candidates.length === 1) {
      this.logger.warn(
        'No pudimos resolver el número del negocio; usamos la única cuenta con whatsappNumber cargado',
      );
      return candidates[0];
    }
    return null;
  }

  // ---------- Sesión ----------

  private async loadSession(accountId: string, phone: string) {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { accountId_phone: { accountId, phone } },
    });
    if (!session || session.expiresAt.getTime() < Date.now()) {
      return { step: STEP.IDLE as string, context: {} as SessionContext };
    }
    return {
      step: session.step,
      context: (session.context ?? {}) as SessionContext,
    };
  }

  private async saveSession(
    accountId: string,
    phone: string,
    step: string,
    context: SessionContext,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const data = {
      step,
      context: context as unknown as Prisma.InputJsonValue,
      expiresAt,
    };
    await this.prisma.whatsappSession.upsert({
      where: { accountId_phone: { accountId, phone } },
      create: { accountId, phone, ...data },
      update: data,
    });
  }

  private async resetSession(accountId: string, phone: string): Promise<void> {
    await this.prisma.whatsappSession
      .delete({ where: { accountId_phone: { accountId, phone } } })
      .catch(() => undefined);
  }

  // ---------- Envío de opciones ----------

  /** ≤3 opciones → reply buttons; más → lista (límite duro de WhatsApp). */
  private async offer(
    phone: string,
    body: string,
    listLabel: string,
    options: KapsoListRow[],
  ): Promise<void> {
    if (options.length <= WA_LIMITS.MAX_BUTTONS) {
      await this.kapso.sendButtons(
        phone,
        body,
        options.map((o) => ({ id: o.id, title: o.title })),
      );
      return;
    }
    await this.kapso.sendList(phone, body, listLabel, options);
  }

  private webUrl(): string {
    const explicit = this.config.get<string>('WEB_URL');
    if (explicit) return explicit.replace(/\/+$/, '');
    const cors = this.config.get<string>('CORS_ORIGINS');
    const first = cors?.split(',')[0]?.trim();
    return (first || 'http://localhost:3000').replace(/\/+$/, '');
  }
}

interface FlowCtx {
  accountId: string;
  timezone: string;
  phone: string;
  patientId: string;
  step: string;
  context: SessionContext;
  buttonId: string | null;
}

/** `prof:abc123` → `['prof', 'abc123']`. El valor puede contener `:`. */
function splitButtonId(buttonId: string): [string, string] {
  const i = buttonId.indexOf(':');
  if (i === -1) return [buttonId, ''];
  return [buttonId.slice(0, i), buttonId.slice(i + 1)];
}

/** Título corto para botón/fila: "vie 8/8 14:30" (≤20 caracteres). */
function formatSlot(iso: string, timezone: string): string {
  const dt = DateTime.fromISO(iso, { zone: timezone }).setLocale('es');
  return dt.toFormat("ccc d/L HH:mm").replace('.', '');
}

/** Texto largo para el cuerpo del mensaje. */
function formatSlotLong(iso: string, timezone: string): string {
  const dt = DateTime.fromISO(iso, { zone: timezone }).setLocale('es');
  return dt.toFormat("cccc d 'de' LLLL 'a las' HH:mm 'hs'");
}
