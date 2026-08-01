'use client';

/**
 * Dos sesiones independientes que pueden convivir en el mismo browser:
 * la del profesional (panel) y la del paciente (flujo público).
 *
 * Se leen de `localStorage` vía `useSyncExternalStore`, así cualquier cambio
 * (login, logout, otra pestaña) se propaga a toda la app sin prop drilling.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  getActiveProfessionalId,
  getPatientSession,
  getProSession,
  setActiveProfessionalId,
  setPatientSession,
  setProSession,
  subscribe,
  type PatientSession,
  type ProSession,
} from './storage';

/** Snapshot serializado para que `useSyncExternalStore` compare por valor. */
function useStoreValue<T>(get: () => T): T | null {
  const getSnapshot = useCallback(() => {
    const value = get();
    return value === null || value === undefined ? null : JSON.stringify(value);
  }, [get]);

  const raw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null, // en el server nunca hay sesión
  );

  return raw === null ? null : (JSON.parse(raw) as T);
}

export interface ProSessionState {
  session: ProSession | null;
  /** `null` mientras hidrata; después `true`/`false`. */
  ready: boolean;
  isOwner: boolean;
  signIn: (session: ProSession) => void;
  signOut: () => void;
}

export function useProSession(): ProSessionState {
  const session = useStoreValue<ProSession>(getProSession);
  const ready = useHydrated();

  return {
    session,
    ready,
    isOwner: Boolean(session?.user.roles?.includes('OWNER')),
    signIn: (next) => setProSession(next),
    signOut: () => setProSession(null),
  };
}

export interface PatientSessionState {
  session: PatientSession | null;
  ready: boolean;
  signIn: (session: PatientSession) => void;
  signOut: () => void;
}

export function usePatientSession(): PatientSessionState {
  const session = useStoreValue<PatientSession>(getPatientSession);
  const ready = useHydrated();

  return {
    session,
    ready,
    signIn: (next) => setPatientSession(next),
    signOut: () => setPatientSession(null),
  };
}

/** Profesional activo del panel (cuentas con más de un profesional). */
export function useActiveProfessionalId(): [string | null, (id: string | null) => void] {
  const value = useStoreValue<string>(getActiveProfessionalId);
  return [value, setActiveProfessionalId];
}

/** `true` recién después de la hidratación: antes no podemos leer localStorage. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Redirige a `redirectTo` si no hay sesión de paciente. */
export function useRequirePatient(redirectTo = '/ingresar'): PatientSessionState {
  const state = usePatientSession();
  const router = useRouter();
  const { ready, session } = state;

  useEffect(() => {
    if (!ready || session) return;
    const next = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    router.replace(`${redirectTo}?next=${next}`);
  }, [ready, session, router, redirectTo]);

  return state;
}
