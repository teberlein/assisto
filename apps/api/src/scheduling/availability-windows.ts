import { DateTime } from 'luxon';

// Utilidades puras (sin Prisma, sin Nest) para pasar de filas de AvailabilitySlot
// a ventanas horarias concretas en la línea de tiempo, resueltas en la TZ de la
// cuenta. Se testean solas y las comparten SlotsService y SchedulingService.

/** Forma mínima de una fila de AvailabilitySlot que necesitamos acá. */
export interface AvailabilityRow {
  dayOfWeek: number | null;
  specificDate: Date | null;
  startTime: string; // "HH:mm" en TZ de la cuenta
  endTime: string; // "HH:mm" en TZ de la cuenta
}

export interface TimeWindow {
  start: DateTime;
  end: DateTime;
}

/** Parsea "HH:mm". Devuelve null si el formato no es válido. */
export function parseHm(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  // Aceptamos "24:00" como fin de día (se resuelve como la medianoche siguiente).
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return { hour, minute };
}

/**
 * `specificDate` está guardado como `@db.Date`, así que Prisma lo devuelve como
 * un Date a medianoche UTC. Hay que leerlo en UTC — leerlo en la TZ local del
 * proceso correría el día para timezones al oeste de Greenwich.
 */
export function isoDateOf(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toISODate() ?? '';
}

/** Convierte "HH:mm" a un DateTime en el día `day` (que ya viene en la TZ correcta). */
function atTime(day: DateTime, hm: string): DateTime | null {
  const parsed = parseHm(hm);
  if (!parsed) return null;
  if (parsed.hour === 24) return day.startOf('day').plus({ days: 1 });
  return day.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });
}

/**
 * Ventanas de disponibilidad de un día puntual.
 *
 * REGLA DE OVERRIDE (decisión de diseño): si para ese día existe al menos un
 * AvailabilitySlot puntual (`specificDate`), ese día usa SOLO los puntuales y se
 * ignoran por completo los recurrentes. La alternativa (unir ambos) haría
 * imposible expresar "este martes atiendo distinto", que es justamente el caso
 * de uso de un slot puntual.
 *
 * Limitación conocida: con este modelo no se puede expresar "este martes no
 * atiendo" (haría falta un tipo de slot de bloqueo/excepción, que no está en el
 * schema todavía).
 */
export function windowsForDay(slots: AvailabilityRow[], day: DateTime): TimeWindow[] {
  const key = day.toISODate();
  const specific = slots.filter((s) => s.specificDate != null && isoDateOf(s.specificDate) === key);

  // luxon usa weekday 1=lunes..7=domingo; nuestro dayOfWeek es 0=domingo..6=sábado.
  const dow = day.weekday % 7;
  const source =
    specific.length > 0
      ? specific
      : slots.filter((s) => s.specificDate == null && s.dayOfWeek === dow);

  const windows: TimeWindow[] = [];
  for (const slot of source) {
    const start = atTime(day, slot.startTime);
    const end = atTime(day, slot.endTime);
    if (!start || !end || end <= start) continue;
    windows.push({ start, end });
  }
  return windows.sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

/**
 * Ventanas de disponibilidad para todos los días calendario que toca el rango
 * [from, to], resueltos en `timezone`.
 */
export function windowsInRange(
  slots: AvailabilityRow[],
  timezone: string,
  from: DateTime,
  to: DateTime,
): TimeWindow[] {
  const out: TimeWindow[] = [];
  let day = from.setZone(timezone).startOf('day');
  const last = to.setZone(timezone).startOf('day');
  // Guarda de seguridad: el controller ya limita el rango a 60 días.
  let guard = 0;
  while (day <= last && guard < 400) {
    out.push(...windowsForDay(slots, day));
    day = day.plus({ days: 1 });
    guard++;
  }
  return out.sort((a, b) => a.start.toMillis() - b.start.toMillis());
}
