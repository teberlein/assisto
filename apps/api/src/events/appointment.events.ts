// Contrato de eventos internos (EventEmitter2).
//
// Desacopla `appointments` (fase 2) del motor de reasignación (fase 3) y de los
// recordatorios (fase 5): AppointmentsService no importa esos módulos, sólo
// emite. Cada consumidor se suscribe con @OnEvent.

export const APPOINTMENT_EVENTS = {
  /** turno creado y persistido (dispara alta en Google Calendar + jobs de recordatorio) */
  CREATED: 'appointment.created',
  /** turno pasó a AVAILABLE_FOR_REASSIGNMENT: el cupo entra al motor (sec 6.1) */
  RELEASED: 'appointment.released',
  /** el cupo liberado fue tomado por otro paciente (sec 6.4) */
  REASSIGNED: 'appointment.reassigned',
  /** turno cerrado definitivamente (CANCELLED) — cancelar jobs pendientes */
  CANCELLED: 'appointment.cancelled',
  /** paciente confirmó asistencia (sec 5.4) */
  CONFIRMED: 'appointment.confirmed',
} as const;

export interface AppointmentCreatedEvent {
  appointmentId: string;
  accountId: string;
  professionalId: string;
  patientId: string;
  startAt: Date;
}

export interface AppointmentReleasedEvent {
  appointmentId: string;
  accountId: string;
  professionalId: string;
  /** paciente que tenía el turno antes de liberarse */
  previousPatientId: string | null;
  startAt: Date;
  releasedBy: 'professional' | 'patient' | 'system';
}

export interface AppointmentReassignedEvent {
  appointmentId: string;
  newPatientId: string;
  previousPatientId: string | null;
  waitlistEntryId: string | null;
}

export interface AppointmentCancelledEvent {
  appointmentId: string;
  accountId: string;
}

export interface AppointmentConfirmedEvent {
  appointmentId: string;
}
