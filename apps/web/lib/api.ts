/**
 * Cliente HTTP tipado contra la API de Asissto.
 *
 * - Inyecta el token según el "scope" de cada endpoint (`professional`,
 *   `patient` o `public`), tomándolo de `lib/storage`.
 * - Normaliza los errores de Nest (`{ statusCode, message, error }`, donde
 *   `message` puede ser string o string[]) en un `ApiError` con `status`.
 */

import { getPatientSession, getProSession } from './storage';
import { MOCK_ENABLED, mockRequest, DemoApiError } from './mock';
import type {
  Account,
  Appointment,
  AvailabilityInput,
  AvailabilitySlot,
  CreateProfessionalInput,
  CreatePublicAppointmentInput,
  JoinWaitlistInput,
  LoginResponse,
  OtpRequestResponse,
  Patient,
  PatientAuthResponse,
  Professional,
  ServiceType,
  ServiceTypeInput,
  SignupOwnerResponse,
  SignupOwnerInput,
  Slot,
  UpdateAccountInput,
  WaitlistEntry,
} from '@/types/api';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** 409: alguien nos ganó de mano (claim de cupo liberado, sec 6.4). */
  get isConflict() {
    return this.status === 409;
  }

  get isUnauthorized() {
    return this.status === 401 || this.status === 403;
  }
}

export type Scope = 'professional' | 'patient' | 'public';

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  scope?: Scope;
  query?: Query;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const base = API_URL.replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function tokenFor(scope: Scope): string | null {
  if (scope === 'professional') return getProSession()?.accessToken ?? null;
  if (scope === 'patient') return getPatientSession()?.accessToken ?? null;
  return null;
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && typeof payload === 'object') {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.filter(Boolean).join('. ');
    if (typeof message === 'string' && message.trim()) return message;
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
  }
  return fallback;
}

const FALLBACK_BY_STATUS: Record<number, string> = {
  400: 'Los datos enviados no son válidos.',
  401: 'Tu sesión venció. Ingresá de nuevo.',
  403: 'No tenés permiso para hacer esto.',
  404: 'No encontramos lo que buscabas.',
  409: 'El recurso cambió de estado. Actualizá y probá de nuevo.',
  429: 'Demasiados intentos. Esperá un momento.',
};

export async function request<T>(
  path: string,
  { method = 'GET', body, scope = 'public', query, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = tokenFor(scope);
  if (token) headers.Authorization = `Bearer ${token}`;

  if (MOCK_ENABLED) {
    try {
      return await mockRequest<T>(path, {
        method,
        body,
        query,
        authHeader: headers.Authorization,
      });
    } catch (error) {
      if (error instanceof DemoApiError) {
        const fallback =
          FALLBACK_BY_STATUS[error.status] ?? `Error del servidor (${error.status}).`;
        throw new ApiError(error.status, error.message || fallback);
      }
      throw error;
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'No pudimos conectarnos con el servidor. Revisá tu conexión e intentá de nuevo.',
    );
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const fallback =
      FALLBACK_BY_STATUS[response.status] ??
      `Error del servidor (${response.status}).`;
    throw new ApiError(
      response.status,
      messageFromPayload(payload, fallback),
      payload,
    );
  }

  return payload as T;
}

/** Mensaje legible para cualquier error atrapado en la UI. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Ocurrió un error inesperado.';
}

/* ------------------------------------------------------------------- api */

export const api = {
  /* auth profesional */
  login: (body: { email: string; password: string }) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body }),

  signupOwner: (body: SignupOwnerInput) =>
    request<SignupOwnerResponse>('/auth/signup-owner', { method: 'POST', body }),

  /* auth paciente */
  registerPatient: (body: { phone: string; fullName: string; email?: string }) =>
    request<Patient>('/patients/register', { method: 'POST', body }),

  requestOtp: (body: { phone: string }) =>
    request<OtpRequestResponse>('/auth/patient/otp/request', {
      method: 'POST',
      body,
    }),

  verifyOtp: (body: { phone: string; code: string }) =>
    request<PatientAuthResponse>('/auth/patient/otp/verify', {
      method: 'POST',
      body,
    }),

  /* cuenta */
  getAccount: () =>
    request<Account>('/accounts/me', { scope: 'professional' }),

  updateAccount: (body: UpdateAccountInput) =>
    request<Account>('/accounts/me', {
      method: 'PATCH',
      body,
      scope: 'professional',
    }),

  /* profesionales */
  listProfessionals: () =>
    request<Professional[]>('/professionals', { scope: 'professional' }),

  createProfessional: (body: CreateProfessionalInput) =>
    request<Professional>('/professionals', {
      method: 'POST',
      body,
      scope: 'professional',
    }),

  /* tipos de servicio */
  listServiceTypes: (professionalId: string) =>
    request<ServiceType[]>(`/professionals/${professionalId}/service-types`, {
      scope: 'professional',
    }),

  createServiceType: (professionalId: string, body: ServiceTypeInput) =>
    request<ServiceType>(`/professionals/${professionalId}/service-types`, {
      method: 'POST',
      body,
      scope: 'professional',
    }),

  updateServiceType: (
    professionalId: string,
    id: string,
    body: Partial<ServiceTypeInput>,
  ) =>
    request<ServiceType>(
      `/professionals/${professionalId}/service-types/${id}`,
      { method: 'PATCH', body, scope: 'professional' },
    ),

  deleteServiceType: (professionalId: string, id: string) =>
    request<void>(`/professionals/${professionalId}/service-types/${id}`, {
      method: 'DELETE',
      scope: 'professional',
    }),

  /* disponibilidad */
  listAvailability: (professionalId: string) =>
    request<AvailabilitySlot[]>(`/professionals/${professionalId}/availability`, {
      scope: 'professional',
    }),

  createAvailability: (professionalId: string, body: AvailabilityInput) =>
    request<AvailabilitySlot>(`/professionals/${professionalId}/availability`, {
      method: 'POST',
      body,
      scope: 'professional',
    }),

  deleteAvailability: (professionalId: string, id: string) =>
    request<void>(`/professionals/${professionalId}/availability/${id}`, {
      method: 'DELETE',
      scope: 'professional',
    }),

  /* agenda */
  listAppointments: (params: {
    professionalId: string;
    from: string;
    to: string;
  }) =>
    request<Appointment[]>('/appointments', {
      scope: 'professional',
      query: params,
    }),

  confirmAppointment: (id: string) =>
    request<Appointment>(`/appointments/${id}/confirm`, {
      method: 'POST',
      scope: 'professional',
    }),

  cancelAppointmentAsProfessional: (id: string) =>
    request<Appointment>(`/appointments/${id}`, {
      method: 'DELETE',
      scope: 'professional',
      query: { by: 'professional' },
    }),

  listWaitlist: (professionalId: string) =>
    request<WaitlistEntry[]>('/waitlist', {
      scope: 'professional',
      query: { professionalId },
    }),

  /* público */
  publicProfessionals: (accountId: string) =>
    request<Professional[]>(`/public/accounts/${accountId}/professionals`),

  publicServiceTypes: (professionalId: string) =>
    request<ServiceType[]>(`/public/professionals/${professionalId}/service-types`),

  slots: (params: {
    professionalId: string;
    serviceTypeId: string;
    from: string;
    to: string;
  }) =>
    request<Slot[]>(`/professionals/${params.professionalId}/slots`, {
      query: {
        serviceTypeId: params.serviceTypeId,
        from: params.from,
        to: params.to,
      },
    }),

  openSlots: (professionalId?: string) =>
    request<Appointment[]>('/public/open-slots', {
      query: { professionalId },
    }),

  /* paciente autenticado */
  createAppointment: (body: CreatePublicAppointmentInput) =>
    request<Appointment>('/public/appointments', {
      method: 'POST',
      body,
      scope: 'patient',
    }),

  myAppointments: () =>
    request<Appointment[]>('/public/me/appointments', { scope: 'patient' }),

  cancelMyAppointment: (id: string) =>
    request<void>(`/public/appointments/${id}`, {
      method: 'DELETE',
      scope: 'patient',
    }),

  joinWaitlist: (body: JoinWaitlistInput) =>
    request<WaitlistEntry>('/public/waitlist', {
      method: 'POST',
      body,
      scope: 'patient',
    }),

  /** Lista de espera propia del paciente (sec 6.2). */
  myWaitlist: () =>
    request<WaitlistEntry[]>('/public/waitlist', { scope: 'patient' }),

  leaveWaitlist: (id: string) =>
    request<void>(`/public/waitlist/${id}`, {
      method: 'DELETE',
      scope: 'patient',
    }),

  /** Tomar un cupo liberado. Puede devolver 409 si otro lo tomó primero. */
  claimAppointment: (id: string) =>
    request<Appointment>(`/appointments/${id}/claim`, {
      method: 'POST',
      scope: 'patient',
    }),
};
