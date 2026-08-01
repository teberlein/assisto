import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_NAMES, JOB_QUEUE, JobQueue } from '../queue/queue.types';
import {
  NOTIFICATION_CHANNEL,
  NotificationChannel,
} from '../notifications/notification-channel';
import {
  APPOINTMENT_EVENTS,
  AppointmentCancelledEvent,
  AppointmentReassignedEvent,
  AppointmentReleasedEvent,
} from '../events/appointment.events';
import { isWithinContactHours, msUntilContactWindow } from './contact-hours';
import { resolveWindow } from './notification-window';
import { Candidate, CandidateSelectorPrisma, selectCandidates } from './candidate-selector';

export interface ReassignmentNotifyJob {
  appointmentId: string;
}

/**
 * Motor de reasignación (sec 6). El ciclo es:
 *
 *   RELEASED ─► scheduleNext(delay 0)
 *                    │
 *                    ▼
 *            job REASSIGNMENT_NOTIFY
 *                    │
 *                    ▼
 *            notifyNextCandidates()
 *              ├─ ¿ya no está disponible?  → corta (alguien lo tomó)
 *              ├─ ¿el turno ya empezó?     → CANCELLED y corta
 *              ├─ ¿fuera de 7:00–22:00?    → reprograma a las 7:00 SIN enviar
 *              └─ envía la tanda ─► scheduleNext(intervalo de la ventana)
 *
 * El job siempre usa el mismo `jobId` (`reassign:<appointmentId>`), así
 * reprogramar pisa el anterior y nunca quedan dos ciclos en paralelo para el
 * mismo turno.
 */
@Injectable()
export class ReassignmentService implements OnModuleInit {
  private readonly logger = new Logger(ReassignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.queue.register<ReassignmentNotifyJob>(
      JOB_NAMES.REASSIGNMENT_NOTIFY,
      (payload) => this.notifyNextCandidates(payload.appointmentId),
    );
  }

  /** id estable del job del motor para un turno dado. */
  static jobIdFor(appointmentId: string): string {
    return `reassign:${appointmentId}`;
  }

  // -------- Enganche con el resto de la app (sec 6.1) --------

  /** Un turno pasó a AVAILABLE_FOR_REASSIGNMENT: arranca el ciclo. */
  @OnEvent(APPOINTMENT_EVENTS.RELEASED)
  async onAppointmentReleased(ev: AppointmentReleasedEvent): Promise<void> {
    this.logger.log(`Turno ${ev.appointmentId} liberado — entra al motor`);
    await this.scheduleNext(ev.appointmentId);
  }

  /** El turno se cerró definitivamente: no queda nada que notificar. */
  @OnEvent(APPOINTMENT_EVENTS.CANCELLED)
  async onAppointmentCancelled(ev: AppointmentCancelledEvent): Promise<void> {
    await this.queue.cancel(ReassignmentService.jobIdFor(ev.appointmentId));
  }

  /** Alguien tomó el cupo: se corta el ciclo (ClaimService ya cancela, esto es red de seguridad). */
  @OnEvent(APPOINTMENT_EVENTS.REASSIGNED)
  async onAppointmentReassigned(ev: AppointmentReassignedEvent): Promise<void> {
    await this.queue.cancel(ReassignmentService.jobIdFor(ev.appointmentId));
  }

  // -------- Ciclo --------

  /**
   * Encola la próxima notificación del turno.
   *
   * `delayMsOverride` lo usan los caminos que ya saben cuánto hay que esperar
   * (reprogramación por horario de contacto, o el intervalo de la ventana recién
   * calculada). Sin override: la primera ronda sale ya mismo y las siguientes
   * usan el intervalo de sec 6.5 calculado con el tiempo restante de ahora.
   */
  async scheduleNext(appointmentId: string, delayMsOverride?: number): Promise<void> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, status: true, startAt: true, notifyRound: true },
    });
    if (!appt) return;
    if (appt.status !== 'AVAILABLE_FOR_REASSIGNMENT') return;

    const now = Date.now();
    let delay =
      delayMsOverride ??
      (appt.notifyRound === 0
        ? 0 // primera ronda: sale ya (el handler decide si el horario lo permite)
        : resolveWindow(appt.startAt.getTime() - now).intervalMs);

    // Nunca programar después del inicio del turno: si llegamos ahí sin tomarlo,
    // el handler lo cierra como CANCELLED.
    const msUntilStart = appt.startAt.getTime() - now;
    if (msUntilStart > 0) delay = Math.min(delay, msUntilStart);

    await this.queue.schedule<ReassignmentNotifyJob>(
      JOB_NAMES.REASSIGNMENT_NOTIFY,
      { appointmentId },
      Math.max(0, delay),
      { jobId: ReassignmentService.jobIdFor(appointmentId) },
    );
  }

  /**
   * Handler del job: manda la tanda que corresponda y reprograma la siguiente.
   * Es idempotente respecto del estado: si el turno ya no está disponible, corta.
   */
  async notifyNextCandidates(appointmentId: string): Promise<void> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        account: { select: { timezone: true, whatsappNumber: true } },
        professional: { select: { displayName: true } },
        serviceType: { select: { name: true } },
      },
    });
    if (!appt) return;

    // Alguien lo tomó (sec 6.4) o se cerró: el ciclo termina acá.
    if (appt.status !== 'AVAILABLE_FOR_REASSIGNMENT') return;

    const now = new Date();

    // El turno ya empezó y nadie lo tomó: se pierde, queda cancelado.
    if (appt.startAt.getTime() <= now.getTime()) {
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledBy: 'system' },
      });
      this.events.emit(APPOINTMENT_EVENTS.CANCELLED, {
        appointmentId,
        accountId: appt.accountId,
      } satisfies AppointmentCancelledEvent);
      this.logger.log(`Turno ${appointmentId} venció sin reasignar — CANCELLED`);
      return;
    }

    const timezone = appt.account.timezone;

    // Sec 6.6: fuera de 7:00–22:00 no se manda NADA. Se reprograma para las 7:00
    // y el tiempo restante se recalcula recién en esa corrida.
    if (!isWithinContactHours(now, timezone)) {
      const delay = msUntilContactWindow(now, timezone);
      this.logger.log(
        `Turno ${appointmentId}: fuera de horario de contacto, se reprograma en ${Math.round(delay / 60_000)} min`,
      );
      await this.scheduleNext(appointmentId, delay);
      return;
    }

    // Sec 6.5: el tiempo restante se mide ACÁ, en el momento de enviar.
    const window = resolveWindow(appt.startAt.getTime() - now.getTime());

    const candidates = await selectCandidates(this.prisma as unknown as CandidateSelectorPrisma, {
      appointment: {
        id: appt.id,
        professionalId: appt.professionalId,
        serviceTypeId: appt.serviceTypeId,
        startAt: appt.startAt,
      },
      timezone,
      limit: window.batchSize,
    });

    if (candidates.length === 0) {
      // Nadie a quien avisar ahora. No se incrementa la ronda: se reintenta al
      // próximo intervalo por si alguien se anota a la lista mientras tanto.
      this.logger.log(`Turno ${appointmentId}: sin candidatos en esta ronda`);
      await this.scheduleNext(appointmentId, window.intervalMs);
      return;
    }

    const body = this.buildOfferBody({
      professionalName: appt.professional.displayName,
      serviceName: appt.serviceType.name,
      startAt: appt.startAt,
      timezone,
    });

    for (const candidate of candidates) {
      await this.sendOffer({
        appointmentId,
        candidate,
        body,
        fromAccountNumber: appt.account.whatsappNumber,
        windowLabel: window.label,
      });
    }

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { notifyRound: { increment: 1 }, lastNotifiedAt: now },
    });

    this.logger.log(
      `Turno ${appointmentId}: ${candidates.length} notificado(s) en ventana ${window.label}`,
    );

    await this.scheduleNext(appointmentId, window.intervalMs);
  }

  /** Cupos abiertos a todos desde el momento cero (sec 6.4) — los muestra la web. */
  listOpenSlots(professionalId?: string) {
    return this.prisma.appointment.findMany({
      where: {
        status: 'AVAILABLE_FOR_REASSIGNMENT',
        startAt: { gt: new Date() },
        ...(professionalId ? { professionalId } : {}),
      },
      select: {
        id: true,
        professionalId: true,
        startAt: true,
        endAt: true,
        releasedAt: true,
        professional: { select: { displayName: true } },
        serviceType: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 100,
    });
  }

  // -------- Auxiliares --------

  private async sendOffer(input: {
    appointmentId: string;
    candidate: Candidate;
    body: string;
    fromAccountNumber: string | null;
    windowLabel: string;
  }): Promise<void> {
    const { appointmentId, candidate, body, fromAccountNumber, windowLabel } = input;
    let externalId: string | undefined;

    try {
      const res = await this.channel.send({
        to: candidate.patient.phone,
        kind: 'REASSIGNMENT_OFFER',
        body,
        buttons: [
          { id: `claim:${appointmentId}:${candidate.entry.id}`, title: 'Lo tomo' },
          { id: `decline:${appointmentId}:${candidate.entry.id}`, title: 'Paso' },
        ],
        fromAccountNumber,
        metadata: {
          appointmentId,
          waitlistEntryId: candidate.entry.id,
          group: candidate.group,
        },
      });
      externalId = res.externalId;
    } catch (err) {
      // Si el envío falla igual dejamos el log: no queremos reintentar contra el
      // mismo candidato en la próxima ronda y bloquear al resto de la lista.
      this.logger.error(
        `Fallo el envío a ${candidate.patient.phone} por el turno ${appointmentId}: ${(err as Error).message}`,
      );
    }

    await this.prisma.notificationLog.create({
      data: {
        appointmentId,
        waitlistEntryId: candidate.entry.id,
        patientId: candidate.patient.id,
        channel: this.channel.name === 'WHATSAPP' ? 'WHATSAPP' : 'SIMULATED',
        windowLabel,
        externalId: externalId ?? null,
      },
    });
  }

  private buildOfferBody(input: {
    professionalName: string;
    serviceName: string;
    startAt: Date;
    timezone: string;
  }): string {
    const local = DateTime.fromJSDate(input.startAt, { zone: input.timezone }).setLocale(
      'es',
    );
    const cuando = local.toFormat("cccc d 'de' LLLL 'a las' HH:mm");
    return (
      `¡Se liberó un turno! ${input.professionalName} — ${input.serviceName}, ` +
      `${cuando} hs. Es por orden de llegada: el primero que confirma se lo queda. ` +
      `¿Lo tomás?`
    );
  }
}
