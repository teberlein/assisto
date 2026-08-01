/**
 * Tipos del contrato de la API de Asissto.
 *
 * Deliberadamente NO se importan desde `packages/shared`: ese paquete lo está
 * escribiendo otro agente en paralelo. Cuando esté estable, este archivo puede
 * reemplazarse por re-exports.
 */

export type Role = 'OWNER' | 'PROFESSIONAL';

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'AVAILABLE_FOR_REASSIGNMENT'
  | 'CANCELLED'
  | 'COMPLETED';

export type AppointmentOrigin = 'WEB' | 'WHATSAPP' | 'REASSIGNMENT';

export type WaitlistStatus = 'ACTIVE' | 'FULFILLED' | 'EXPIRED' | 'CANCELLED';

/* ------------------------------------------------------------------ auth */

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  accountId: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface SignupOwnerResponse {
  accessToken: string;
  user: AuthUser;
  account: Account;
}

export interface OtpRequestResponse {
  sent: boolean;
  simulated: boolean;
}

export interface PatientAuthResponse {
  accessToken: string;
  patient: Patient;
}

/* -------------------------------------------------------------- entidades */

export interface Account {
  id: string;
  name: string;
  timezone: string;
  whatsappNumber?: string | null;
}

export interface Professional {
  id: string;
  accountId?: string;
  displayName: string;
  userId?: string | null;
  user?: { id: string; email: string; fullName: string } | null;
  googleCalendarId?: string | null;
}

export interface ServiceType {
  id: string;
  professionalId?: string;
  name: string;
  durationMinutes: number;
  active: boolean;
}

/** Exactamente uno de `dayOfWeek` o `specificDate` viene seteado. */
export interface AvailabilitySlot {
  id: string;
  professionalId?: string;
  /** 0 = domingo … 6 = sábado */
  dayOfWeek?: number | null;
  /** 'YYYY-MM-DD' */
  specificDate?: string | null;
  /** 'HH:mm' */
  startTime: string;
  /** 'HH:mm' */
  endTime: string;
}

export interface Patient {
  id: string;
  phone: string;
  fullName: string;
  email?: string | null;
  createdAt?: string;
}

export interface Appointment {
  id: string;
  professionalId: string;
  professional?: Professional | null;
  patientId?: string | null;
  patient?: Patient | null;
  serviceTypeId?: string | null;
  serviceType?: ServiceType | null;
  /** ISO 8601 */
  startAt: string;
  /** ISO 8601 */
  endAt: string;
  status: AppointmentStatus;
  origin: AppointmentOrigin;
  originalAppointmentId?: string | null;
  createdAt?: string;
}

/** Franja libre calculada por la API a partir de disponibilidad + duración. */
export interface Slot {
  startAt: string;
  endAt: string;
}

export interface WaitlistEntry {
  id: string;
  patientId: string;
  patient?: Patient | null;
  professionalId: string;
  professional?: Professional | null;
  serviceTypeId?: string | null;
  serviceType?: ServiceType | null;
  /** 0..6 */
  preferredDaysOfWeek?: number[] | null;
  /** Si viene seteado, el paciente ya tiene turno y quiere adelantarlo. */
  linkedAppointmentId?: string | null;
  linkedAppointment?: Appointment | null;
  status: WaitlistStatus;
  createdAt: string;
}

/* ----------------------------------------------------------------- inputs */

export interface SignupOwnerInput {
  email: string;
  password: string;
  fullName: string;
  accountName: string;
}

export interface CreateProfessionalInput {
  displayName: string;
  email: string;
  password: string;
  fullName: string;
}

export interface ServiceTypeInput {
  name: string;
  durationMinutes: number;
  active?: boolean;
}

export interface AvailabilityInput {
  dayOfWeek?: number;
  specificDate?: string;
  startTime: string;
  endTime: string;
}

export interface UpdateAccountInput {
  name?: string;
  timezone?: string;
  whatsappNumber?: string | null;
}

export interface CreatePublicAppointmentInput {
  professionalId: string;
  serviceTypeId: string;
  startAt: string;
}

export interface JoinWaitlistInput {
  professionalId: string;
  serviceTypeId?: string;
  preferredDaysOfWeek?: number[];
  linkedAppointmentId?: string;
}
