import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JOB_QUEUE, JobQueue } from '../queue/queue.types';
import {
  APPOINTMENT_EVENTS,
  AppointmentReassignedEvent,
  AppointmentReleasedEvent,
} from '../events/appointment.events';
import { ReassignmentService } from './reassignment.service';

export type ClaimSource = 'web' | 'whatsapp';

/** Fila cruda del RETURNING del update atómico. */
interface ClaimedRow {
  id: string;
  accountId: string;
  professionalId: string;
  serviceTypeId: string;
  patientId: string | null;
  previousPatientId: string | null;
  startAt: Date;
  endAt: Date;
  status: string;
  origin: string;
}

/**
 * Confirmación de un cupo liberado (sec 6.4).
 *
 * **Un único método para todos los canales.** WhatsApp (fase 4) y web usan
 * `claim()` exactamente igual; lo único que cambia es el `source`, que queda
 * registrado. No hay ventanas reservadas ni prioridad de acceso: la prioridad
 * de sec 6.3 es sobre a quién se le AVISA primero, no sobre quién puede tomarlo.
 *
 * La carrera se resuelve con un `UPDATE ... WHERE status='AVAILABLE_FOR_REASSIGNMENT'
 * RETURNING *`: Postgres serializa las escrituras sobre la misma fila, así que
 * exactamente una transacción ve la fila en ese estado y las demás actualizan
 * 0 filas. El que pierde recibe 409 y se le loguea LOST_RACE.
 */
@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    private readonly events: EventEmitter2,
  ) {}

  async claim(appointmentId: string, patientId: string, source: ClaimSource) {
    const existing = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, status: true, startAt: true },
    });
    if (!existing) throw new NotFoundException('El turno no existe');

    if (existing.startAt.getTime() <= Date.now()) {
      throw new ConflictException('El turno ya pasó');
    }

    // ---- El update atómico: acá se decide quién gana (sec 6.4) ----
    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE "Appointment"
         SET "patientId"   = ${patientId},
             "status"      = 'SCHEDULED'::"AppointmentStatus",
             "origin"      = 'REASSIGNMENT'::"AppointmentOrigin",
             "cancelledAt" = NULL,
             "cancelledBy" = NULL,
             "confirmedAt" = NULL,
             "updatedAt"   = NOW()
       WHERE "id" = ${appointmentId}
         AND "status" = 'AVAILABLE_FOR_REASSIGNMENT'::"AppointmentStatus"
      RETURNING *`;

    if (rows.length === 0) {
      await this.logLostRace(appointmentId, patientId);
      this.logger.log(
        `Turno ${appointmentId}: ${patientId} perdió la carrera (source=${source})`,
      );
      throw new ConflictException('El turno ya fue tomado');
    }

    const claimed = rows[0];
    const previousPatientId = claimed.previousPatientId;

    // ---- Todo lo que no es atómico, en una transacción ----
    const outcome = await this.prisma.$transaction(async (tx) => {
      // La inscripción que originó la oferta; si tomó el cupo sin haber sido
      // notificado (sec 6.4: está abierto a todos), buscamos cualquier activa suya.
      const entry = await this.findWaitlistEntry(tx, {
        appointmentId,
        patientId,
        professionalId: claimed.professionalId,
      });

      if (entry) {
        await tx.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: 'FULFILLED' },
        });
      }

      // Marca la respuesta en el log de la oferta, si es que hubo una.
      await tx.notificationLog.updateMany({
        where: { appointmentId, patientId, response: null },
        data: { response: 'ACCEPTED', respondedAt: new Date() },
      });

      // sec 6.8: registro para la comisión fija por turno reasignado.
      await tx.reassignmentEvent.create({
        data: {
          appointmentId,
          // Deuda técnica: el schema los declara no-nullables. Un cupo liberado
          // siempre tuvo dueño, así que previousPatientId viene seteado; el
          // waitlistEntryId puede faltar si lo tomó alguien de afuera de la lista.
          previousPatientId: previousPatientId ?? '',
          newPatientId: patientId,
          waitlistEntryId: entry?.id ?? '',
        },
      });

      // ---- sec 6.7: adelantamiento (flujo recursivo) ----
      // El evento se arma acá pero se emite recién después del commit.
      let released: AppointmentReleasedEvent | null = null;
      const linkedId = entry?.linkedAppointmentId ?? null;
      if (linkedId && linkedId !== appointmentId) {
        // Sólo se libera si sigue vivo y sigue siendo de este paciente.
        const updated = await tx.appointment.updateMany({
          where: {
            id: linkedId,
            patientId,
            status: { in: ['SCHEDULED', 'CONFIRMED'] },
          },
          data: {
            status: 'AVAILABLE_FOR_REASSIGNMENT',
            patientId: null,
            previousPatientId: patientId,
            releasedAt: new Date(),
            notifyRound: 0,
            lastNotifiedAt: null,
            cancelledBy: 'system',
          },
        });
        if (updated.count > 0) {
          const original = await tx.appointment.findUnique({
            where: { id: linkedId },
            select: { id: true, accountId: true, professionalId: true, startAt: true },
          });
          // Traza del adelantamiento (sec 7: "referencia a un turno original").
          await tx.appointment.update({
            where: { id: appointmentId },
            data: { originalAppointmentId: linkedId },
          });
          if (original) {
            released = {
              appointmentId: original.id,
              accountId: original.accountId,
              professionalId: original.professionalId,
              previousPatientId: patientId,
              startAt: original.startAt,
              releasedBy: 'system',
            };
          }
        }
      }

      return { entry, released };
    });

    // El ciclo del motor para este turno ya no tiene sentido.
    await this.queue.cancel(ReassignmentService.jobIdFor(appointmentId));

    this.events.emit(APPOINTMENT_EVENTS.REASSIGNED, {
      appointmentId,
      newPatientId: patientId,
      previousPatientId,
      waitlistEntryId: outcome.entry?.id ?? null,
    } satisfies AppointmentReassignedEvent);

    // El cupo que se liberó por adelantamiento vuelve a entrar al motor por el
    // mismo camino que cualquier cancelación (sec 6.1).
    //
    // No hay recursión infinita: el selector de candidatos sólo ofrece un cupo
    // al grupo 2 si es ESTRICTAMENTE más temprano que el turno que ya tienen
    // (candidate-selector.ts), así que cada eslabón de la cadena libera un turno
    // con startAt mayor que el que se tomó. La secuencia es estrictamente
    // creciente y finita: no puede volver sobre un turno ya visitado.
    if (outcome.released) {
      this.events.emit(APPOINTMENT_EVENTS.RELEASED, outcome.released);
      this.logger.log(
        `Adelantamiento: el turno ${outcome.released.appointmentId} vuelve al motor (sec 6.7)`,
      );
    }

    this.logger.log(
      `Turno ${appointmentId} reasignado a ${patientId} (source=${source})`,
    );

    return {
      id: claimed.id,
      status: claimed.status,
      origin: claimed.origin,
      startAt: claimed.startAt,
      endAt: claimed.endAt,
      professionalId: claimed.professionalId,
      serviceTypeId: claimed.serviceTypeId,
      patientId,
      releasedOriginalAppointmentId: outcome.released?.appointmentId ?? null,
    };
  }

  private async findWaitlistEntry(
    tx: Prisma.TransactionClient,
    input: { appointmentId: string; patientId: string; professionalId: string },
  ) {
    const log = await tx.notificationLog.findFirst({
      where: { appointmentId: input.appointmentId, patientId: input.patientId },
      orderBy: { sentAt: 'desc' },
      select: { waitlistEntryId: true },
    });
    if (log) {
      const fromLog = await tx.waitlistEntry.findUnique({
        where: { id: log.waitlistEntryId },
        select: { id: true, linkedAppointmentId: true, status: true },
      });
      if (fromLog && fromLog.status === 'ACTIVE') return fromLog;
    }

    return tx.waitlistEntry.findFirst({
      where: {
        patientId: input.patientId,
        professionalId: input.professionalId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, linkedAppointmentId: true, status: true },
    });
  }

  /** El que pierde la carrera queda registrado como LOST_RACE (sec 6.4). */
  private async logLostRace(appointmentId: string, patientId: string): Promise<void> {
    await this.prisma.notificationLog.updateMany({
      where: { appointmentId, patientId, response: null },
      data: { response: 'LOST_RACE', respondedAt: new Date() },
    });
  }
}
