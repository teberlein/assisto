// Horario de contacto del motor (sec 6.6): las ofertas de reasignación sólo
// salen entre las 7:00 y las 22:00 en la zona horaria de la cuenta.
//
// Si el turno se libera fuera de ese rango, NO se manda nada: se reprograma
// para las 7:00 y recién ahí se recalcula el tiempo restante (sec 6.5), lo que
// puede implicar entrar directo en modo broadcast.

import { DateTime } from 'luxon';

/** primera hora en la que se puede notificar (inclusive) */
export const CONTACT_START_HOUR = 7;
/** hora a partir de la cual ya no se notifica (exclusive) */
export const CONTACT_END_HOUR = 22;

/** ¿`now` cae dentro de la franja 7:00–22:00 de la TZ de la cuenta? */
export function isWithinContactHours(now: Date, timezone: string): boolean {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  return local.hour >= CONTACT_START_HOUR && local.hour < CONTACT_END_HOUR;
}

/**
 * Próximo instante en que se puede notificar.
 * - Antes de las 7:00 → hoy a las 7:00.
 * - 22:00 o más tarde → mañana a las 7:00.
 * - Dentro de la franja → `now` (no hay que esperar nada).
 */
export function nextContactWindowStart(now: Date, timezone: string): Date {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  if (local.hour >= CONTACT_START_HOUR && local.hour < CONTACT_END_HOUR) {
    return now;
  }
  const base = local.hour >= CONTACT_END_HOUR ? local.plus({ days: 1 }) : local;
  return base
    .set({ hour: CONTACT_START_HOUR, minute: 0, second: 0, millisecond: 0 })
    .toJSDate();
}

/** Delay en ms hasta la próxima franja de contacto (0 si ya estamos adentro). */
export function msUntilContactWindow(now: Date, timezone: string): number {
  return Math.max(0, nextContactWindowStart(now, timezone).getTime() - now.getTime());
}
