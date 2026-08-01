import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { JOB_NAMES, JOB_QUEUE, JobQueue } from '../queue/queue.types';
import {
  NOTIFICATION_CHANNEL,
  NotificationChannel,
} from '../notifications/notification-channel';
import {
  APPOINTMENT_EVENTS,
  AppointmentCancelledEvent,
  AppointmentConfirmedEvent,
  AppointmentCreatedEvent,
  AppointmentReassignedEvent,
  AppointmentReleasedEvent,
} from '../events/appointment.events';
import {
  buildAutoCancelMessage,
  buildReminderMessage,
  confirmButtonId,
} from './reminder-message';

// Fase 5 (sec 5.4): recordatorio a 48 h + auto-cancelación a 24 h.
//
// El módulo no toca AppointmentsService para cancelar "a mano": llama a
// `cancel(id, 'system')`, que es el mismo camino de una cancelación manual y
// deja el cupo en AVAILABLE_FOR_REASSIGNMENT emitiendo RELEASED. Así la
// auto-cancelación entra al motor de reasignación sin lógica duplicada.

export const REMINDER_LEAD_MS = 48 * 60 * 60 * 1000;
export const AUTO_CANCEL_LEAD_MS = 24 * 60 * 60 * 1000;

export interface ReminderJobPayload {
  appointmentId: string;
}

export const reminderJobId = (appointmentId: string) =>
  `reminder:${appointmentId}`;
export const autoCancelJobId = (appointmentId: string) =>
  `autocancel:${appointmentId}`;

@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  onModuleInit() {
    this.queue.register<ReminderJobPayload>(
      JOB_NAMES.APPOINTMENT_REMINDER,
      (payload) => this.handleReminder(payload.appointmentId),
    );
    this.queue.register<ReminderJobPayload>(
      JOB_NAMES.APPOINTMENT_AUTO_CANCEL,
      (payload) => this.handleAutoCancel(payload.appointmentId),
    );
  }

  // -------- Reacción a eventos --------

  @OnEvent(APPOINTMENT_EVENTS.CREATED)
  async onCreated(event: AppointmentCreatedEvent) {
    await this.scheduleFor(event.appointmentId, event.startAt);
  }

  /** Confirmó: ya no hay nada que auto-cancelar. El recordatorio, si sigue
   *  pendiente, también sobra (el handler igual lo filtraría por estado). */
  @OnEvent(APPOINTMENT_EVENTS.CONFIRMED)
  async onConfirmed(event: AppointmentConfirmedEvent) {
    await this.queue.cancel(autoCancelJobId(event.appointmentId));
    await this.queue.cancel(reminderJobId(event.appointmentId));
  }

  /** El cupo se liberó: el turno ya no tiene dueño, no hay a quién recordarle. */
  @OnEvent(APPOINTMENT_EVENTS.RELEASED)
  async onReleased(event: AppointmentReleasedEvent) {
    await this.cancelBoth(event.appointmentId);
  }

  @OnEvent(APPOINTMENT_EVENTS.CANCELLED)
  async onCancelled(event: AppointmentCancelledEvent) {
    await this.cancelBoth(event.appointmentId);
  }

  /**
   * El cupo lo tomó otro paciente: el ciclo de recordatorio/confirmación
   * arranca de cero para el paciente nuevo. Como los jobId son estables por
   * appointmentId, reprogramar pisa lo que hubiera quedado.
   */
  @OnEvent(APPOINTMENT_EVENTS.REASSIGNED)
  async onReassigned(event: AppointmentReassignedEvent) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: event.appointmentId },
      select: { startAt: true },
    });
    if (!appointment) return;
    await this.cancelBoth(event.appointmentId);
    await this.scheduleFor(event.appointmentId, appointment.startAt);
  }

  // -------- Programación --------

  /**
   * Programa los dos jobs de sec 5.4 para un turno.
   *
   * Casos de anticipación corta (decisión de diseño):
   *
   * - Entre 24 h y 48 h: el recordatorio "a 48 h antes" ya está vencido, así que
   *   se manda inmediatamente (delay 0) y el auto-cancel se mantiene en su
   *   horario natural (24 h antes del turno). El paciente conserva algo de
   *   ventana real para confirmar y el deadline que se le comunica sigue siendo
   *   el mismo que para cualquier otro turno.
   *
   * - Menos de 24 h: no se programa nada. El deadline de confirmación ya estaría
   *   en el pasado, así que auto-cancelar equivaldría a cancelar un turno que el
   *   paciente acaba de reservar por decisión propia — el acto de reservar con
   *   tan poca anticipación ES la confirmación. Además el cupo liberado entraría
   *   al motor con muy poco margen para reasignarse. Tampoco tiene sentido el
   *   recordatorio: la reserva es más reciente que el recordatorio mismo.
   *   `autoCancelAt` queda en null, que es la marca de "este turno no está
   *   sujeto a auto-cancelación".
   */
  private async scheduleFor(appointmentId: string, startAt: Date) {
    const now = Date.now();
    const start = startAt.getTime();
    const msUntilStart = start - now;

    if (msUntilStart <= AUTO_CANCEL_LEAD_MS) {
      this.logger.debug(
        `Turno ${appointmentId} reservado con menos de 24 h: sin recordatorio ni auto-cancelación`,
      );
      return;
    }

    const autoCancelAt = new Date(start - AUTO_CANCEL_LEAD_MS);
    // `autoCancelAt` se persiste porque es el deadline literal que el
    // recordatorio le comunica al paciente: tiene que ser el mismo valor que
    // usa el job, aunque el job se reprograme o el proceso se reinicie.
    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { autoCancelAt },
    });

    const reminderDelay = Math.max(0, start - REMINDER_LEAD_MS - now);
    await this.queue.schedule<ReminderJobPayload>(
      JOB_NAMES.APPOINTMENT_REMINDER,
      { appointmentId },
      reminderDelay,
      { jobId: reminderJobId(appointmentId) },
    );

    await this.queue.schedule<ReminderJobPayload>(
      JOB_NAMES.APPOINTMENT_AUTO_CANCEL,
      { appointmentId },
      autoCancelAt.getTime() - now,
      { jobId: autoCancelJobId(appointmentId) },
    );
  }

  private async cancelBoth(appointmentId: string) {
    await this.queue.cancel(reminderJobId(appointmentId));
    await this.queue.cancel(autoCancelJobId(appointmentId));
  }

  // -------- Handlers de job --------

  /**
   * Recordatorio de 48 h. Relee el turno: entre que se programó el job y ahora
   * pudo haberse confirmado, cancelado o reasignado. La cola no es la fuente de
   * verdad, la DB sí.
   */
  async handleReminder(appointmentId: string) {
    const appointment = await this.loadForNotification(appointmentId);
    if (!appointment) return;
    if (appointment.status !== AppointmentStatus.SCHEDULED) return;
    if (!appointment.patient) return;
    // Sin deadline no podemos escribir la frase literal que pide sec 5.4.
    if (!appointment.autoCancelAt) return;

    const body = buildReminderMessage({
      patientFullName: appointment.patient.fullName,
      professionalName: appointment.professional.displayName,
      startAt: appointment.startAt,
      deadlineAt: appointment.autoCancelAt,
      timezone: appointment.account.timezone,
    });

    await this.channel.send({
      to: appointment.patient.phone,
      kind: 'REMINDER',
      body,
      buttons: [
        { id: confirmButtonId(appointment.id), title: 'Confirmar asistencia' },
      ],
      fromAccountNumber: appointment.account.whatsappNumber,
      metadata: { appointmentId: appointment.id },
    });

    await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { reminderSentAt: new Date() },
    });
  }

  /**
   * Auto-cancelación de 24 h. Si el paciente confirmó (o el turno ya no está
   * vigente) no hace nada. Si sigue SCHEDULED, cancela por el camino normal
   * para que el cupo entre al motor de reasignación (sec 5.4 + sec 6.1).
   */
  async handleAutoCancel(appointmentId: string) {
    const appointment = await this.loadForNotification(appointmentId);
    if (!appointment) return;
    if (appointment.status !== AppointmentStatus.SCHEDULED) return;

    // Los datos del paciente se leen ANTES de cancelar: al liberarse el cupo,
    // `patientId` pasa a null y ya no habría a quién avisarle.
    const patient = appointment.patient;

    await this.appointments.cancel(appointment.id, 'system');
    this.logger.log(
      `Turno ${appointment.id} auto-cancelado por falta de confirmación`,
    );

    if (!patient) return;
    await this.channel.send({
      to: patient.phone,
      kind: 'REMINDER',
      body: buildAutoCancelMessage({
        patientFullName: patient.fullName,
        professionalName: appointment.professional.displayName,
        startAt: appointment.startAt,
        timezone: appointment.account.timezone,
      }),
      fromAccountNumber: appointment.account.whatsappNumber,
      metadata: { appointmentId: appointment.id },
    });
  }

  private loadForNotification(appointmentId: string) {
    return this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        startAt: true,
        autoCancelAt: true,
        patient: { select: { id: true, fullName: true, phone: true } },
        professional: { select: { displayName: true } },
        account: { select: { timezone: true, whatsappNumber: true } },
      },
    });
  }
}
