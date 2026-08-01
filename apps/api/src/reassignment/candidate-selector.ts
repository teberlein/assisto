// Selección de candidatos de la lista de espera (sec 6.3).
//
// Prioridad:
//   Grupo 1 — pacientes SIN turno agendado (WaitlistEntry.linkedAppointmentId null).
//   Grupo 2 — pacientes CON turno que pidieron adelantarlo (linkedAppointmentId seteado).
// Grupo 1 completo antes que grupo 2; dentro de cada grupo, FIFO por createdAt
// (sec 6.3 / sec 11: el criterio por default es orden de inscripción).
//
// La función no depende de Nest ni de PrismaService concreto: recibe un objeto
// con la forma mínima que necesita, así los tests unitarios la ejercitan con un
// mock plano y sin base de datos.

import { DateTime } from 'luxon';

export interface WaitlistCandidateRow {
  id: string;
  patientId: string;
  professionalId: string;
  serviceTypeId: string | null;
  preferredDaysOfWeek: number[];
  linkedAppointmentId: string | null;
  createdAt: Date;
  patient: { id: string; fullName: string; phone: string };
}

export interface Candidate {
  entry: WaitlistCandidateRow;
  patient: { id: string; fullName: string; phone: string };
  /** 1 = sin turno propio, 2 = quiere adelantar (sec 6.3) */
  group: 1 | 2;
}

/** Turno liberado, con lo mínimo que hace falta para filtrar. */
export interface ReleasedAppointmentRef {
  id: string;
  professionalId: string;
  serviceTypeId: string;
  startAt: Date;
}

/** Forma mínima de Prisma que consume el selector (facilita el mock en tests). */
export interface CandidateSelectorPrisma {
  notificationLog: {
    findMany(args: unknown): Promise<{ waitlistEntryId: string; patientId: string }[]>;
  };
  waitlistEntry: {
    findMany(args: unknown): Promise<WaitlistCandidateRow[]>;
  };
  appointment: {
    findMany(args: unknown): Promise<{ id: string; startAt: Date; status: string }[]>;
  };
}

/** Estados en los que el turno propio del grupo 2 sigue "vivo" y vale adelantarlo. */
const LIVE_STATUSES = ['SCHEDULED', 'CONFIRMED'];

export async function selectCandidates(
  prisma: CandidateSelectorPrisma,
  input: {
    appointment: ReleasedAppointmentRef;
    /** TZ de la cuenta: el día de la semana del turno se evalúa acá (sec 11) */
    timezone: string;
    /** cuántos candidatos devolver (1 secuencial, N en broadcast) */
    limit: number;
  },
): Promise<Candidate[]> {
  const { appointment, timezone, limit } = input;
  if (limit <= 0) return [];

  // Día de la semana del turno EN LA TZ DE LA CUENTA. Luxon usa 1=lunes..7=domingo;
  // el schema usa la convención JS 0=domingo..6=sábado, de ahí el `% 7`.
  const dayOfWeek =
    DateTime.fromJSDate(appointment.startAt, { zone: timezone }).weekday % 7;

  // A quién ya le ofrecimos ESTE turno: no se le vuelve a escribir.
  const alreadyNotified = await prisma.notificationLog.findMany({
    where: { appointmentId: appointment.id },
    select: { waitlistEntryId: true, patientId: true },
  });
  const notifiedEntries = new Set(alreadyNotified.map((n) => n.waitlistEntryId));
  const notifiedPatients = new Set(alreadyNotified.map((n) => n.patientId));

  // Usa el índice WaitlistEntry(professionalId, status, createdAt): el orderBy
  // por createdAt sale del índice, sin sort en memoria.
  const entries = await prisma.waitlistEntry.findMany({
    where: { professionalId: appointment.professionalId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: { patient: { select: { id: true, fullName: true, phone: true } } },
  });

  const eligible = entries.filter((e) => {
    if (notifiedEntries.has(e.id) || notifiedPatients.has(e.patientId)) return false;
    // preferredDaysOfWeek vacío = cualquier día (sec 6.2)
    if (e.preferredDaysOfWeek.length > 0 && !e.preferredDaysOfWeek.includes(dayOfWeek)) {
      return false;
    }
    // serviceTypeId es opcional: si lo especificó, tiene que coincidir
    if (e.serviceTypeId && e.serviceTypeId !== appointment.serviceTypeId) return false;
    return true;
  });

  const group1 = eligible.filter((e) => !e.linkedAppointmentId);
  const group2Raw = eligible.filter(
    // el turno liberado no puede ser el suyo propio
    (e) => e.linkedAppointmentId && e.linkedAppointmentId !== appointment.id,
  );

  // Grupo 2: sólo tiene sentido si el cupo liberado es MÁS TEMPRANO que el turno
  // que ya tienen. "Adelantar" hacia atrás no existe — y además es lo que corta
  // la recursión de sec 6.7: cada adelantamiento libera un turno estrictamente
  // posterior, así que la cadena termina.
  const group2: WaitlistCandidateRow[] = [];
  if (group2Raw.length > 0) {
    const linkedIds = [...new Set(group2Raw.map((e) => e.linkedAppointmentId!))];
    const linked = await prisma.appointment.findMany({
      where: { id: { in: linkedIds } },
      select: { id: true, startAt: true, status: true },
    });
    const byId = new Map(linked.map((a) => [a.id, a]));
    for (const e of group2Raw) {
      const own = byId.get(e.linkedAppointmentId!);
      if (!own) continue;
      if (!LIVE_STATUSES.includes(own.status)) continue;
      if (appointment.startAt.getTime() >= own.startAt.getTime()) continue;
      group2.push(e);
    }
  }

  const ordered: Candidate[] = [
    ...group1.map((entry) => toCandidate(entry, 1)),
    ...group2.map((entry) => toCandidate(entry, 2)),
  ];

  // Un mismo paciente puede tener varias inscripciones activas; se le escribe
  // una sola vez por turno liberado.
  const seenPatients = new Set<string>();
  const deduped = ordered.filter((c) => {
    if (seenPatients.has(c.patient.id)) return false;
    seenPatients.add(c.patient.id);
    return true;
  });

  return deduped.slice(0, limit);
}

function toCandidate(entry: WaitlistCandidateRow, group: 1 | 2): Candidate {
  return { entry, patient: entry.patient, group };
}
