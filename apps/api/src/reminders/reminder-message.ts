import { DateTime } from 'luxon';

// Construcción de los textos de fase 5 (sec 5.4) como funciones puras: reciben
// datos + timezone y devuelven strings. Sin Nest, sin Prisma, sin `new Date()`
// implícito, para poder testear el formato y la TZ sin levantar nada.

export interface ReminderMessageInput {
  /** nombre completo del paciente; se usa sólo el primer nombre para el saludo */
  patientFullName: string;
  /** cómo se muestra el profesional, ej. "Dra. Ana" */
  professionalName: string;
  /** inicio del turno (UTC) */
  startAt: Date;
  /** deadline literal de confirmación: 24 h antes del turno (UTC) */
  deadlineAt: Date;
  /** TZ de la cuenta, ej. "America/Argentina/Buenos_Aires" */
  timezone: string;
}

// Días y meses en castellano. Los hardcodeamos en vez de usar el locale de
// luxon porque depende del ICU con el que se haya compilado Node: en una imagen
// con small-icu saldría en inglés y el paciente recibiría "Thursday".
const WEEKDAYS = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
  'domingo',
];

/** Formatea un instante en la TZ de la cuenta como "jueves 14/8 a las 15:30". */
export function formatMoment(at: Date, timezone: string): string {
  const dt = DateTime.fromJSDate(at, { zone: timezone });
  // luxon: weekday 1=lunes .. 7=domingo
  const weekday = WEEKDAYS[dt.weekday - 1];
  return `${weekday} ${dt.day}/${dt.month} a las ${dt.toFormat('HH:mm')}`;
}

/**
 * Texto del recordatorio de 48 h.
 *
 * Requisito explícito de sec 5.4: el mensaje tiene que decir *literalmente* la
 * hora límite de confirmación, no "en 24 hs". Por eso `deadlineAt` se formatea
 * completo (día + hora) y no como duración relativa.
 */
export function buildReminderMessage(input: ReminderMessageInput): string {
  const firstName = firstNameOf(input.patientFullName);
  const turno = formatMoment(input.startAt, input.timezone);
  const deadline = formatMoment(input.deadlineAt, input.timezone);
  return (
    `Hola ${firstName}, te recordamos tu turno con ${input.professionalName} el ${turno}. ` +
    `Confirmá tu asistencia; si no confirmás antes del ${deadline}, ` +
    `el turno se cancela automáticamente.`
  );
}

/** Texto que se manda cuando el turno efectivamente se auto-canceló. */
export function buildAutoCancelMessage(
  input: Omit<ReminderMessageInput, 'deadlineAt'>,
): string {
  const firstName = firstNameOf(input.patientFullName);
  const turno = formatMoment(input.startAt, input.timezone);
  return (
    `Hola ${firstName}, cancelamos tu turno con ${input.professionalName} del ${turno} ` +
    `porque no recibimos tu confirmación a tiempo. El horario queda disponible para ` +
    `otro paciente. Si querés, podés sacar un turno nuevo cuando quieras.`
  );
}

/** Id del botón de confirmar que vuelve por el webhook del canal. */
export function confirmButtonId(appointmentId: string): string {
  return `confirm:${appointmentId}`;
}

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fullName.trim();
}
