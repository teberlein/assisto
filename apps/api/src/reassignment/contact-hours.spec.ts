// Tests unitarios puros del horario de contacto (sec 6.6). Sin DB, sin Nest.

import { DateTime } from 'luxon';
import {
  isWithinContactHours,
  msUntilContactWindow,
  nextContactWindowStart,
} from './contact-hours';

const TZ = 'America/Argentina/Buenos_Aires';

/** Helper: instante UTC correspondiente a una hora local de la cuenta. */
function local(iso: string): Date {
  return DateTime.fromISO(iso, { zone: TZ }).toJSDate();
}

describe('contact-hours (sec 6.6)', () => {
  it('7:00 ya está adentro, 21:59 también', () => {
    expect(isWithinContactHours(local('2026-08-03T07:00'), TZ)).toBe(true);
    expect(isWithinContactHours(local('2026-08-03T21:59'), TZ)).toBe(true);
  });

  it('6:59, 22:00 y las 3 de la mañana están afuera', () => {
    expect(isWithinContactHours(local('2026-08-03T06:59'), TZ)).toBe(false);
    expect(isWithinContactHours(local('2026-08-03T22:00'), TZ)).toBe(false);
    expect(isWithinContactHours(local('2026-08-03T03:00'), TZ)).toBe(false);
  });

  it('de madrugada reprograma para las 7:00 del mismo día', () => {
    const now = local('2026-08-03T03:00');
    expect(nextContactWindowStart(now, TZ)).toEqual(local('2026-08-03T07:00'));
    expect(msUntilContactWindow(now, TZ)).toBe(4 * 60 * 60_000);
  });

  it('de noche reprograma para las 7:00 del día siguiente', () => {
    const now = local('2026-08-03T23:30');
    expect(nextContactWindowStart(now, TZ)).toEqual(local('2026-08-04T07:00'));
    expect(msUntilContactWindow(now, TZ)).toBe(7.5 * 60 * 60_000);
  });

  it('dentro de la franja no hay que esperar nada', () => {
    const now = local('2026-08-03T10:15');
    expect(msUntilContactWindow(now, TZ)).toBe(0);
  });

  it('la franja se evalúa en la TZ de la cuenta, no en UTC', () => {
    // 09:00 UTC = 06:00 en Buenos Aires (afuera) pero 09:00 en Madrid (adentro).
    const instant = DateTime.fromISO('2026-08-03T09:00', { zone: 'utc' }).toJSDate();
    expect(isWithinContactHours(instant, TZ)).toBe(false);
    expect(isWithinContactHours(instant, 'Europe/Madrid')).toBe(true);
  });
});
