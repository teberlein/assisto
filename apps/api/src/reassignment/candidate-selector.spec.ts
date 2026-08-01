// Tests unitarios del selector de candidatos (sec 6.3). Prisma va mockeado:
// no hace falta base de datos.

import { DateTime } from 'luxon';
import {
  CandidateSelectorPrisma,
  ReleasedAppointmentRef,
  WaitlistCandidateRow,
  selectCandidates,
} from './candidate-selector';

const TZ = 'America/Argentina/Buenos_Aires';

const START = DateTime.fromISO('2026-08-05T15:00', { zone: TZ });
/** día del turno en la convención del schema (0=domingo..6=sábado) */
const DOW = START.weekday % 7;
const OTHER_DOW = (DOW + 3) % 7;

const released: ReleasedAppointmentRef = {
  id: 'appt-libre',
  professionalId: 'prof-1',
  serviceTypeId: 'srv-1',
  startAt: START.toJSDate(),
};

let seq = 0;
function entry(over: Partial<WaitlistCandidateRow> = {}): WaitlistCandidateRow {
  seq += 1;
  const id = over.id ?? `w${seq}`;
  return {
    id,
    patientId: over.patientId ?? `p${seq}`,
    professionalId: 'prof-1',
    serviceTypeId: null,
    preferredDaysOfWeek: [],
    linkedAppointmentId: null,
    // createdAt creciente según el orden de creación → FIFO natural
    createdAt: new Date(2026, 0, 1, 0, seq),
    patient: {
      id: over.patientId ?? `p${seq}`,
      fullName: `Paciente ${id}`,
      phone: `+549110000${String(seq).padStart(4, '0')}`,
    },
    ...over,
  };
}

function mockPrisma(input: {
  entries: WaitlistCandidateRow[];
  notified?: { waitlistEntryId: string; patientId: string }[];
  appointments?: { id: string; startAt: Date; status: string }[];
}): CandidateSelectorPrisma {
  return {
    notificationLog: { findMany: jest.fn().mockResolvedValue(input.notified ?? []) },
    waitlistEntry: { findMany: jest.fn().mockResolvedValue(input.entries) },
    appointment: { findMany: jest.fn().mockResolvedValue(input.appointments ?? []) },
  };
}

describe('selectCandidates (sec 6.3)', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('grupo 1 (sin turno propio) va antes que grupo 2 (quiere adelantar)', async () => {
    // El del grupo 2 se anotó PRIMERO y aun así va segundo: la prioridad de
    // grupo manda por sobre el FIFO.
    const adelantador = entry({
      id: 'w-adelanta',
      patientId: 'p-adelanta',
      linkedAppointmentId: 'appt-propio',
    });
    const sinTurno = entry({ id: 'w-sin-turno', patientId: 'p-sin-turno' });

    const prisma = mockPrisma({
      entries: [adelantador, sinTurno],
      appointments: [
        {
          id: 'appt-propio',
          // su turno actual es más tarde → el liberado sí lo adelanta
          startAt: START.plus({ days: 3 }).toJSDate(),
          status: 'SCHEDULED',
        },
      ],
    });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });

    expect(res.map((c) => c.entry.id)).toEqual(['w-sin-turno', 'w-adelanta']);
    expect(res.map((c) => c.group)).toEqual([1, 2]);
  });

  it('dentro de cada grupo el orden es FIFO por createdAt', async () => {
    const a = entry({ id: 'a' });
    const b = entry({ id: 'b' });
    const c = entry({ id: 'c' });
    // Llegan desordenados desde el mock; la query ya los pide ordenados, así
    // que se los pasamos en orden para reflejar el índice.
    const prisma = mockPrisma({ entries: [a, b, c] });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res.map((e) => e.entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('respeta el limit (1 en secuencial, N en broadcast)', async () => {
    const prisma = mockPrisma({ entries: [entry(), entry(), entry(), entry()] });

    const uno = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 1,
    });
    expect(uno).toHaveLength(1);

    const varios = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 5,
    });
    expect(varios).toHaveLength(4);
  });

  it('filtra por preferredDaysOfWeek evaluando el día en la TZ de la cuenta', async () => {
    const coincide = entry({ id: 'coincide', preferredDaysOfWeek: [DOW] });
    const noCoincide = entry({ id: 'no-coincide', preferredDaysOfWeek: [OTHER_DOW] });
    const cualquierDia = entry({ id: 'cualquiera', preferredDaysOfWeek: [] });

    const prisma = mockPrisma({ entries: [coincide, noCoincide, cualquierDia] });
    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res.map((c) => c.entry.id)).toEqual(['coincide', 'cualquiera']);
  });

  it('filtra por serviceTypeId cuando la inscripción lo especifica', async () => {
    const mismo = entry({ id: 'mismo', serviceTypeId: 'srv-1' });
    const otro = entry({ id: 'otro', serviceTypeId: 'srv-2' });
    const sinPreferencia = entry({ id: 'sin-pref', serviceTypeId: null });

    const prisma = mockPrisma({ entries: [mismo, otro, sinPreferencia] });
    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res.map((c) => c.entry.id)).toEqual(['mismo', 'sin-pref']);
  });

  it('excluye a quien ya fue notificado por ESTE turno', async () => {
    const yaAvisado = entry({ id: 'ya', patientId: 'p-ya' });
    const nuevo = entry({ id: 'nuevo', patientId: 'p-nuevo' });

    const prisma = mockPrisma({
      entries: [yaAvisado, nuevo],
      notified: [{ waitlistEntryId: 'ya', patientId: 'p-ya' }],
    });
    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res.map((c) => c.entry.id)).toEqual(['nuevo']);
  });

  it('no le escribe dos veces al mismo paciente aunque tenga dos inscripciones', async () => {
    const a = entry({ id: 'a', patientId: 'p-dup' });
    const b = entry({ id: 'b', patientId: 'p-dup' });
    const prisma = mockPrisma({ entries: [a, b] });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res).toHaveLength(1);
    expect(res[0].entry.id).toBe('a');
  });

  it('grupo 2: descarta si el cupo liberado NO es más temprano que su turno', async () => {
    const masTarde = entry({ id: 'mas-tarde', linkedAppointmentId: 'appt-temprano' });
    const masTemprano = entry({ id: 'mas-temprano', linkedAppointmentId: 'appt-tarde' });

    const prisma = mockPrisma({
      entries: [masTarde, masTemprano],
      appointments: [
        // su turno ya es antes que el liberado → adelantar "hacia atrás" no existe
        { id: 'appt-temprano', startAt: START.minus({ hours: 2 }).toJSDate(), status: 'SCHEDULED' },
        { id: 'appt-tarde', startAt: START.plus({ hours: 2 }).toJSDate(), status: 'SCHEDULED' },
      ],
    });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res.map((c) => c.entry.id)).toEqual(['mas-temprano']);
  });

  it('grupo 2: descarta si el turno liberado es el suyo propio', async () => {
    const propio = entry({ id: 'propio', linkedAppointmentId: released.id });
    const prisma = mockPrisma({ entries: [propio] });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res).toHaveLength(0);
    // Ni siquiera consulta los turnos linkeados: se descartó antes.
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('grupo 2: descarta si su turno ya no está vivo', async () => {
    const cancelado = entry({ id: 'cancelado', linkedAppointmentId: 'appt-cancelado' });
    const prisma = mockPrisma({
      entries: [cancelado],
      appointments: [
        { id: 'appt-cancelado', startAt: START.plus({ days: 1 }).toJSDate(), status: 'CANCELLED' },
      ],
    });

    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 10,
    });
    expect(res).toHaveLength(0);
  });

  it('pide sólo las inscripciones ACTIVE del profesional, ordenadas por createdAt', async () => {
    const prisma = mockPrisma({ entries: [] });
    await selectCandidates(prisma, { appointment: released, timezone: TZ, limit: 1 });

    // Usa el índice WaitlistEntry(professionalId, status, createdAt).
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { professionalId: 'prof-1', status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('limit 0 no consulta nada', async () => {
    const prisma = mockPrisma({ entries: [entry()] });
    const res = await selectCandidates(prisma, {
      appointment: released,
      timezone: TZ,
      limit: 0,
    });
    expect(res).toEqual([]);
    expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
  });
});
