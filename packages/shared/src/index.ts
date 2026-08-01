// Tipos del contrato HTTP compartidos entre la API y el frontend Next.
// Regla: este paquete NO importa @prisma/client — los enums se redeclaran acá
// para que el web no dependa del client de Prisma.

// -------------------------------------------------------------------- enums

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'AVAILABLE_FOR_REASSIGNMENT'
  | 'CANCELLED'
  | 'COMPLETED';

export type AppointmentOrigin = 'WEB' | 'WHATSAPP' | 'REASSIGNMENT';

export type WaitlistStatus = 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';

export type Role = 'OWNER' | 'PROFESSIONAL';

export type CancelledBy = 'professional' | 'patient' | 'system';

/** 0 = domingo … 6 = sábado (mismo criterio que AvailabilitySlot.dayOfWeek). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ------------------------------------------------------------------- agenda

/** Un hueco libre. Fechas siempre en ISO 8601 UTC. */
export interface Slot {
  startAt: string;
  endAt: string;
}

export interface ProfessionalDto {
  id: string;
  accountId: string;
  displayName: string;
}

export interface ServiceTypeDto {
  id: string;
  professionalId: string;
  name: string;
  durationMinutes: number;
}

export interface PatientSummaryDto {
  id: string;
  fullName: string;
  phone: string;
}

export interface AppointmentDto {
  id: string;
  accountId: string;
  professionalId: string;
  serviceTypeId: string;
  /** null cuando el turno está AVAILABLE_FOR_REASSIGNMENT (sec 6.4) */
  patientId: string | null;
  /** quién tenía el turno antes de liberarse */
  previousPatientId: string | null;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: CancelledBy | null;
  releasedAt: string | null;
  /** presentes cuando el endpoint los incluye */
  patient?: PatientSummaryDto | null;
  serviceType?: Pick<ServiceTypeDto, 'id' | 'name' | 'durationMinutes'>;
  professional?: Pick<ProfessionalDto, 'id' | 'displayName'>;
}

export interface WaitlistEntryDto {
  id: string;
  patientId: string;
  professionalId: string;
  serviceTypeId: string | null;
  preferredDaysOfWeek: DayOfWeek[];
  /** si está seteado, es "avisame si se libera un turno antes" (sec 6.2) */
  linkedAppointmentId: string | null;
  status: WaitlistStatus;
  createdAt: string;
  professional?: Pick<ProfessionalDto, 'id' | 'displayName'>;
}

// ---------------------------------------------------- payloads de requests

export interface ListSlotsQuery {
  serviceTypeId: string;
  /** "YYYY-MM-DD" o ISO completo; el rango no puede superar los 60 días */
  from: string;
  to: string;
}

export interface CreatePublicAppointmentBody {
  professionalId: string;
  serviceTypeId: string;
  startAt: string;
}

export interface JoinWaitlistBody {
  professionalId: string;
  serviceTypeId?: string;
  preferredDaysOfWeek?: DayOfWeek[];
  linkedAppointmentId?: string;
}
