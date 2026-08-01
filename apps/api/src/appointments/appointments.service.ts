import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Appointment, AppointmentOrigin, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import {
  APPOINTMENT_EVENTS,
  AppointmentCancelledEvent,
  AppointmentConfirmedEvent,
  AppointmentCreatedEvent,
  AppointmentReleasedEvent,
} from '../events/appointment.events';

export type CancelledBy = 'professional' | 'patient' | 'system';

export interface CreateAppointmentInput {
  professionalId: string;
  serviceTypeId: string;
  patientId: string;
  /** ISO 8601 */
  startAt: string;
  origin: AppointmentOrigin;
  /** si viene, se valida que el profesional pertenezca a esa cuenta */
  expectedAccountId?: string;
}

export interface ListAppointmentsFilter {
  from?: Date;
  to?: Date;
  status?: AppointmentStatus[];
}

/** Estados que se consideran "el turno sigue vivo" a los fines de cancelar. */
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

/** Estados terminales: ya no se pueden cancelar de nuevo. */
const TERMINAL_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
    private readonly events: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------- create

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const professional = await this.prisma.professional.findUnique({
      where: { id: input.professionalId },
      select: { id: true, accountId: true },
    });
    if (!professional) throw new NotFoundException('No encontramos al profesional');
    if (input.expectedAccountId && professional.accountId !== input.expectedAccountId) {
      // Desde el panel: no se puede agendar en la agenda de otra cuenta.
      throw new ForbiddenException('El profesional no pertenece a tu cuenta');
    }

    const serviceType = await this.prisma.serviceType.findFirst({
      where: { id: input.serviceTypeId, professionalId: input.professionalId },
      select: { durationMinutes: true, active: true },
    });
    if (!serviceType) {
      throw new BadRequestException('El servicio no pertenece a este profesional');
    }
    if (!serviceType.active) {
      throw new BadRequestException('El servicio no está activo');
    }

    const startAt = new Date(input.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('La fecha de inicio no es válida');
    }
    if (startAt.getTime() <= Date.now()) {
      throw new BadRequestException('No se puede agendar un turno en el pasado');
    }
    const endAt = new Date(startAt.getTime() + serviceType.durationMinutes * 60_000);

    await this.scheduling.assertWithinAvailability(input.professionalId, startAt, endAt);
    await this.scheduling.assertNoOverlap(input.professionalId, startAt, endAt);

    const appointment = await this.prisma.appointment.create({
      data: {
        accountId: professional.accountId,
        professionalId: input.professionalId,
        serviceTypeId: input.serviceTypeId,
        patientId: input.patientId,
        startAt,
        endAt,
        status: AppointmentStatus.SCHEDULED,
        origin: input.origin,
      },
    });

    this.events.emit(APPOINTMENT_EVENTS.CREATED, {
      appointmentId: appointment.id,
      accountId: appointment.accountId,
      professionalId: appointment.professionalId,
      patientId: input.patientId,
      startAt: appointment.startAt,
    } satisfies AppointmentCreatedEvent);

    return appointment;
  }

  // --------------------------------------------------------------- confirm

  /** SCHEDULED → CONFIRMED (sec 5.4). Idempotente vía updateMany condicionado. */
  async confirm(id: string): Promise<Appointment> {
    const now = new Date();
    const res = await this.prisma.appointment.updateMany({
      where: { id, status: AppointmentStatus.SCHEDULED },
      data: { status: AppointmentStatus.CONFIRMED, confirmedAt: now },
    });

    const appointment = await this.prisma.appointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException('No encontramos el turno');

    if (res.count === 0) {
      if (appointment.status === AppointmentStatus.CONFIRMED) return appointment;
      throw new ConflictException('El turno no está en un estado que se pueda confirmar');
    }

    this.events.emit(APPOINTMENT_EVENTS.CONFIRMED, {
      appointmentId: appointment.id,
    } satisfies AppointmentConfirmedEvent);

    return appointment;
  }

  // ---------------------------------------------------------------- cancel

  /**
   * Cancelación (sec 5.3 / 6.1).
   *
   * Si el turno es futuro y está vivo, NO se cancela: muta a
   * AVAILABLE_FOR_REASSIGNMENT para que el cupo entre al motor de reasignación
   * (el paciente se guarda en `previousPatientId` y `patientId` queda null).
   * Si el turno ya pasó, o ya no está vivo, se cierra como CANCELLED.
   *
   * Todo pasa dentro de una transacción y con `updateMany` condicionado por
   * status: si otra request ganó la carrera, `count === 0` y devolvemos 409 en
   * vez de pisar el estado.
   */
  async cancel(id: string, by: CancelledBy): Promise<Appointment> {
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('No encontramos el turno');

      const isFuture = current.startAt.getTime() > now.getTime();
      const isActive = ACTIVE_STATUSES.includes(current.status);

      if (isFuture && isActive) {
        const updated = await tx.appointment.updateMany({
          where: { id, status: { in: ACTIVE_STATUSES } },
          data: {
            status: AppointmentStatus.AVAILABLE_FOR_REASSIGNMENT,
            previousPatientId: current.patientId,
            patientId: null,
            releasedAt: now,
            cancelledBy: by,
            confirmedAt: null,
            notifyRound: 0,
            lastNotifiedAt: null,
          },
        });
        if (updated.count === 0) {
          throw new ConflictException('El turno cambió de estado, volvé a intentar');
        }
        const appointment = await tx.appointment.findUniqueOrThrow({ where: { id } });
        return { appointment, released: true as const, previousPatientId: current.patientId };
      }

      const updated = await tx.appointment.updateMany({
        where: { id, status: { notIn: TERMINAL_STATUSES } },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancelledAt: now,
          cancelledBy: by,
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('El turno ya estaba cancelado o completado');
      }
      const appointment = await tx.appointment.findUniqueOrThrow({ where: { id } });
      return { appointment, released: false as const, previousPatientId: current.patientId };
    });

    // Los eventos se emiten después del commit: los consumidores (motor,
    // Google Calendar) leen la DB y tienen que ver el estado ya persistido.
    if (result.released) {
      this.events.emit(APPOINTMENT_EVENTS.RELEASED, {
        appointmentId: result.appointment.id,
        accountId: result.appointment.accountId,
        professionalId: result.appointment.professionalId,
        previousPatientId: result.previousPatientId,
        startAt: result.appointment.startAt,
        releasedBy: by,
      } satisfies AppointmentReleasedEvent);
    } else {
      this.events.emit(APPOINTMENT_EVENTS.CANCELLED, {
        appointmentId: result.appointment.id,
        accountId: result.appointment.accountId,
      } satisfies AppointmentCancelledEvent);
    }

    return result.appointment;
  }

  // ----------------------------------------------------------------- reads

  /**
   * Agenda del profesional. Devuelve también los AVAILABLE_FOR_REASSIGNMENT
   * para que el profesional vea los cupos liberados en su agenda.
   */
  listByProfessional(professionalId: string, filter: ListAppointmentsFilter = {}) {
    return this.prisma.appointment.findMany({
      where: {
        professionalId,
        ...(filter.status?.length ? { status: { in: filter.status } } : {}),
        ...(filter.from || filter.to
          ? { startAt: { gte: filter.from ?? undefined, lt: filter.to ?? undefined } }
          : {}),
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        serviceType: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  listByPatient(patientId: string) {
    return this.prisma.appointment.findMany({
      where: { patientId },
      include: {
        serviceType: { select: { id: true, name: true, durationMinutes: true } },
        professional: { select: { id: true, displayName: true, accountId: true } },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  async get(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, serviceType: true, professional: true },
    });
    if (!appointment) throw new NotFoundException('No encontramos el turno');
    return appointment;
  }

  /** Igual que `get` pero exige que el turno sea de la cuenta del usuario. */
  async getForAccount(id: string, accountId: string) {
    const appointment = await this.get(id);
    if (appointment.accountId !== accountId) {
      // 404 y no 403: no filtramos la existencia de turnos de otras cuentas.
      throw new NotFoundException('No encontramos el turno');
    }
    return appointment;
  }

  /** Exige que el turno sea del paciente autenticado (flujo público). */
  async getForPatient(id: string, patientId: string) {
    const appointment = await this.get(id);
    if (appointment.patientId !== patientId) {
      throw new NotFoundException('No encontramos el turno');
    }
    return appointment;
  }

  /** Valida que un profesional pertenezca a la cuenta del usuario logueado. */
  async assertProfessionalInAccount(professionalId: string, accountId: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { id: professionalId, accountId },
      select: { id: true },
    });
    if (!professional) throw new NotFoundException('No encontramos al profesional');
    return professional;
  }
}
