/**
 * Helpers de fecha/hora. Todo se muestra en la zona horaria del browser.
 * (La API guarda en la TZ de la cuenta; para el MVP asumimos que el
 * profesional navega desde esa misma zona.)
 */

export const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

const timeFmt = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const dateShortFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function parse(iso: string): Date {
  return new Date(iso);
}

export function fmtTime(iso: string | Date): string {
  return timeFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtLongDate(iso: string | Date): string {
  return dateFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtShortDate(iso: string | Date): string {
  return dateShortFmt.format(typeof iso === 'string' ? new Date(iso) : iso);
}

export function fmtDateTime(iso: string | Date): string {
  return `${fmtLongDate(iso)}, ${fmtTime(iso)}`;
}

/** 'YYYY-MM-DD' en hora local (no UTC). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parsea 'YYYY-MM-DD' como fecha local (evita el corrimiento de `new Date(str)`). */
export function fromISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

/** Lunes de la semana de `date`, a las 00:00 locales. */
export function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const day = next.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(next, diff);
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** Minutos desde medianoche, en hora local. */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Etiqueta del rango de una semana: "3 – 9 de marzo de 2026". */
export function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const month = new Intl.DateTimeFormat('es-AR', { month: 'long' });
  const year = end.getFullYear();
  if (sameMonth) {
    return `${weekStart.getDate()} – ${end.getDate()} de ${month.format(end)} de ${year}`;
  }
  return `${weekStart.getDate()} de ${month.format(weekStart)} – ${end.getDate()} de ${month.format(end)} de ${year}`;
}

/** "en 3 días", "en 2 horas", "hace 10 minutos". */
export function relativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  return rtf.format(Math.round(diffMs / day), 'day');
}

/** 'HH:mm' → minutos. */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
