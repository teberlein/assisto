/**
 * Persistencia de sesiones en el browser.
 *
 * Decisión: `localStorage` y no cookies.
 *  - Todo el fetch autenticado va directo a la API (otro origen) con
 *    `Authorization: Bearer`. Ninguna cookie del origen de Next sirve para eso.
 *  - Necesitamos DOS sesiones simultáneas e independientes (profesional y
 *    paciente) en el mismo browser: dos claves separadas lo resuelven sin
 *    ambigüedad de scope.
 *  - No renderizamos nada autenticado en el server, así que no perdemos nada
 *    por no tener el token disponible en SSR.
 *  Contrapartida asumida: es vulnerable a XSS. Mitigación: no inyectamos HTML
 *  crudo en ningún lado y el token es de vida corta del lado de la API.
 */

import type { AuthUser, Patient } from '@/types/api';

const PRO_KEY = 'asissto.session.professional';
const PATIENT_KEY = 'asissto.session.patient';
const ACTIVE_PROFESSIONAL_KEY = 'asissto.activeProfessionalId';
const PATIENT_ACCOUNT_KEY = 'asissto.patientAccountId';

export interface ProSession {
  accessToken: string;
  user: AuthUser;
}

export interface PatientSession {
  accessToken: string;
  patient: Patient;
}

type Listener = () => void;

const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

/** Suscripción para `useSyncExternalStore`. Cubre cambios en esta pestaña y en otras. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', listener);
    }
  };
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage lleno o bloqueado: seguimos en memoria de la pestaña */
  }
  emit();
}

/* ------------------------------------------------------------ profesional */

export function getProSession(): ProSession | null {
  return read<ProSession>(PRO_KEY);
}

export function setProSession(session: ProSession | null) {
  write(PRO_KEY, session);
  if (!session) write(ACTIVE_PROFESSIONAL_KEY, null);
}

/* -------------------------------------------------------------- paciente */

export function getPatientSession(): PatientSession | null {
  return read<PatientSession>(PATIENT_KEY);
}

export function setPatientSession(session: PatientSession | null) {
  write(PATIENT_KEY, session);
}

/* -------------------------------------------- profesional activo del panel */

export function getActiveProfessionalId(): string | null {
  return read<string>(ACTIVE_PROFESSIONAL_KEY);
}

export function setActiveProfessionalId(id: string | null) {
  write(ACTIVE_PROFESSIONAL_KEY, id);
}

/* -------------------------------------- cuenta desde la que entró el paciente */

/**
 * El paciente llega con `?accountId=` (link de WhatsApp o del consultorio).
 * Lo recordamos para que no tenga que volver a pasarlo en cada navegación.
 */
export function getPatientAccountId(): string | null {
  return read<string>(PATIENT_ACCOUNT_KEY);
}

export function setPatientAccountId(id: string | null) {
  write(PATIENT_ACCOUNT_KEY, id);
}
