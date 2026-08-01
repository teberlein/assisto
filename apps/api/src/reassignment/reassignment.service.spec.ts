// Tests del ciclo del motor (sec 6.5 / 6.6) con Prisma falso en memoria,
// la MemoryQueue real y el SimulatedChannel real. No necesitan base de datos.

import { EventEmitter2 } from '@nestjs/event-emitter';
import { DateTime } from 'luxon';
import { MemoryQueue } from '../queue/memory-queue';
import { SimulatedChannel } from '../notifications/simulated.channel';
import { PrismaService } from '../prisma/prisma.service';
import { ReassignmentService } from './reassignment.service';

const TZ = 'America/Argentina/Buenos_Aires';
const HOUR = 3_600_000;

interface FakeAppt {
  id: string;
  accountId: string;
  professionalId: string;
  serviceTypeId: string;
  patientId: string | null;
  previousPatientId: string | null;
  startAt: Date;
  status: string;
  notifyRound: number;
  lastNotifiedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  account: { timezone: string; whatsappNumber: string | null };
  professional: { displayName: string };
  serviceType: { name: string };
}

interface FakeEntry {
  id: string;
  patientId: string;
  professionalId: string;
  serviceTypeId: string | null;
  preferredDaysOfWeek: number[];
  linkedAppointmentId: string | null;
  status: string;
  createdAt: Date;
  patient: { id: string; fullName: string; phone: string };
}

interface FakeLog {
  appointmentId: string;
  waitlistEntryId: string;
  patientId: string;
  channel: string;
  windowLabel: string;
  externalId: string | null;
}

/** Prisma mínimo en memoria: sólo lo que toca ReassignmentService. */
function fakePrisma(state: {
  appointments: FakeAppt[];
  waitlist: FakeEntry[];
  logs: FakeLog[];
}) {
  const byId = (id: string) => state.appointments.find((a) => a.id === id) ?? null;

  return {
    state,
    appointment: {
      findUnique: jest.fn(async (args: any) => byId(args.where.id)),
      findMany: jest.fn(async (args: any) => {
        const ids: string[] = args?.where?.id?.in ?? [];
        return state.appointments.filter((a) => ids.includes(a.id));
      }),
      update: jest.fn(async (args: any) => {
        const appt = byId(args.where.id);
        if (!appt) throw new Error('not found');
        for (const [k, v] of Object.entries(args.data as Record<string, any>)) {
          if (v && typeof v === 'object' && 'increment' in v) {
            (appt as any)[k] = ((appt as any)[k] ?? 0) + v.increment;
          } else {
            (appt as any)[k] = v;
          }
        }
        return appt;
      }),
    },
    waitlistEntry: {
      findMany: jest.fn(async (args: any) =>
        state.waitlist
          .filter(
            (w) =>
              w.professionalId === args.where.professionalId &&
              w.status === args.where.status,
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
    },
    notificationLog: {
      findMany: jest.fn(async (args: any) =>
        state.logs.filter((l) => l.appointmentId === args.where.appointmentId),
      ),
      create: jest.fn(async (args: any) => {
        state.logs.push(args.data);
        return args.data;
      }),
    },
  } as unknown as PrismaService & { state: typeof state };
}

function makeAppt(over: Partial<FakeAppt> = {}): FakeAppt {
  return {
    id: 'appt-1',
    accountId: 'acc-1',
    professionalId: 'prof-1',
    serviceTypeId: 'srv-1',
    patientId: null,
    previousPatientId: 'p-original',
    startAt: new Date(),
    status: 'AVAILABLE_FOR_REASSIGNMENT',
    notifyRound: 0,
    lastNotifiedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    account: { timezone: TZ, whatsappNumber: '+5491100000000' },
    professional: { displayName: 'Dra. Ana' },
    serviceType: { name: 'Consulta' },
    ...over,
  };
}

let entrySeq = 0;
function makeEntry(over: Partial<FakeEntry> = {}): FakeEntry {
  entrySeq += 1;
  const patientId = over.patientId ?? `p${entrySeq}`;
  return {
    id: over.id ?? `w${entrySeq}`,
    patientId,
    professionalId: 'prof-1',
    serviceTypeId: null,
    preferredDaysOfWeek: [],
    linkedAppointmentId: null,
    status: 'ACTIVE',
    createdAt: new Date(2020, 0, 1, 0, entrySeq),
    patient: {
      id: patientId,
      fullName: `Paciente ${patientId}`,
      phone: `+549110000${String(entrySeq).padStart(4, '0')}`,
    },
    ...over,
  };
}

function build(state: {
  appointments: FakeAppt[];
  waitlist: FakeEntry[];
  logs: FakeLog[];
}) {
  const prisma = fakePrisma(state);
  const queue = new MemoryQueue();
  const channel = new SimulatedChannel();
  const events = new EventEmitter2();
  const service = new ReassignmentService(prisma, queue, channel, events);
  service.onModuleInit();
  return { prisma, queue, channel, events, service, state };
}

describe('ReassignmentService — ciclo del motor', () => {
  beforeEach(() => {
    entrySeq = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('al liberarse el turno encola la primera notificación con jobId estable', async () => {
    const appt = makeAppt({ startAt: new Date(Date.now() + 5 * HOUR) });
    const { service, queue } = build({ appointments: [appt], waitlist: [], logs: [] });
    const spy = jest.spyOn(queue, 'schedule');

    await service.onAppointmentReleased({
      appointmentId: appt.id,
      accountId: appt.accountId,
      professionalId: appt.professionalId,
      previousPatientId: 'p-original',
      startAt: appt.startAt,
      releasedBy: 'patient',
    });

    expect(spy).toHaveBeenCalledWith(
      'reassignment.notify',
      { appointmentId: 'appt-1' },
      0,
      { jobId: 'reassign:appt-1' },
    );
  });

  it('reprogramar dos veces no duplica el job (jobId estable)', async () => {
    const appt = makeAppt({ startAt: new Date(Date.now() + 5 * HOUR) });
    const { service, queue } = build({ appointments: [appt], waitlist: [], logs: [] });

    await service.scheduleNext(appt.id, 60_000);
    await service.scheduleNext(appt.id, 120_000);

    expect(queue.pending()).toHaveLength(1);
    expect(queue.pending()[0].id).toBe('reassign:appt-1');
  });

  it('si el turno ya no está disponible, corta sin notificar', async () => {
    const appt = makeAppt({
      status: 'SCHEDULED',
      startAt: new Date(Date.now() + 5 * HOUR),
    });
    const { service, channel } = build({
      appointments: [appt],
      waitlist: [makeEntry()],
      logs: [],
    });

    await service.notifyNextCandidates(appt.id);
    expect(channel.sent).toHaveLength(0);
  });

  it('si el turno ya empezó lo cierra como CANCELLED y emite el evento', async () => {
    const appt = makeAppt({ startAt: new Date(Date.now() - 60_000) });
    const { service, channel, events } = build({
      appointments: [appt],
      waitlist: [makeEntry()],
      logs: [],
    });
    const emitted = jest.fn();
    events.on('appointment.cancelled', emitted);

    await service.notifyNextCandidates(appt.id);

    expect(appt.status).toBe('CANCELLED');
    expect(appt.cancelledBy).toBe('system');
    expect(channel.sent).toHaveLength(0);
    expect(emitted).toHaveBeenCalledWith({ appointmentId: 'appt-1', accountId: 'acc-1' });
  });

  it('modo secuencial: notifica a UNO, loguea la ventana y reprograma', async () => {
    // Mediodía en la TZ de la cuenta, turno dentro de 5 h → ventana 4–24 h.
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T12:00', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-05T17:00', { zone: TZ }).toJSDate(),
    });
    const { service, channel, queue, state } = build({
      appointments: [appt],
      waitlist: [makeEntry({ id: 'w1' }), makeEntry({ id: 'w2' })],
      logs: [],
    });

    await service.notifyNextCandidates(appt.id);

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].kind).toBe('REASSIGNMENT_OFFER');
    expect(channel.sent[0].fromAccountNumber).toBe('+5491100000000');
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].windowLabel).toBe('4_24h_secuencial');
    expect(state.logs[0].waitlistEntryId).toBe('w1');
    expect(appt.notifyRound).toBe(1);
    expect(appt.lastNotifiedAt).not.toBeNull();

    // Próxima ronda a los 30 min de la ventana 4–24 h.
    const [pending] = queue.pending();
    expect(pending.id).toBe('reassign:appt-1');
    expect(pending.runAt - Date.now()).toBe(30 * 60_000);
  });

  it('la segunda ronda le escribe al siguiente, no al mismo', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T12:00', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-05T17:00', { zone: TZ }).toJSDate(),
    });
    const { service, channel, state } = build({
      appointments: [appt],
      waitlist: [makeEntry({ id: 'w1' }), makeEntry({ id: 'w2' })],
      logs: [],
    });

    await service.notifyNextCandidates(appt.id);
    await service.notifyNextCandidates(appt.id);

    expect(state.logs.map((l) => l.waitlistEntryId)).toEqual(['w1', 'w2']);
    expect(channel.sent).toHaveLength(2);
    expect(appt.notifyRound).toBe(2);
  });

  it('menos de 1 h: broadcast simultáneo a varios candidatos', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T12:00', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-05T12:40', { zone: TZ }).toJSDate(),
    });
    const waitlist = Array.from({ length: 8 }, () => makeEntry());
    const { service, channel, state } = build({ appointments: [appt], waitlist, logs: [] });

    await service.notifyNextCandidates(appt.id);

    expect(channel.sent).toHaveLength(5); // BROADCAST_BATCH_SIZE
    expect(state.logs.every((l) => l.windowLabel === 'menos_1h_broadcast')).toBe(true);
    // Una sola ronda aunque hayan sido 5 envíos.
    expect(appt.notifyRound).toBe(1);
  });

  it('sin candidatos no incrementa la ronda pero reintenta al próximo intervalo', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T12:00', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-05T17:00', { zone: TZ }).toJSDate(),
    });
    const { service, channel, queue } = build({
      appointments: [appt],
      waitlist: [],
      logs: [],
    });

    await service.notifyNextCandidates(appt.id);

    expect(channel.sent).toHaveLength(0);
    expect(appt.notifyRound).toBe(0);
    expect(queue.pending()).toHaveLength(1);
  });

  // ---- sec 6.6 ----
  it('cancelación a las 03:00 → se reprograma para las 07:00 y el tiempo restante se recalcula recién ahí', async () => {
    jest.useFakeTimers();
    const tresAM = DateTime.fromISO('2026-08-05T03:00', { zone: TZ });
    jest.setSystemTime(tresAM.toJSDate());

    // Turno a las 09:00 del mismo día: a las 03:00 faltan 6 h (ventana 4–24 h),
    // pero a las 07:00 faltan sólo 2 h (ventana 1–4 h). Si el motor hubiera
    // fijado la ventana al momento de la cancelación, el label sería el otro.
    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-05T09:00', { zone: TZ }).toJSDate(),
    });
    const { service, channel, queue, state } = build({
      appointments: [appt],
      waitlist: [makeEntry({ id: 'w1' })],
      logs: [],
    });

    await service.onAppointmentReleased({
      appointmentId: appt.id,
      accountId: appt.accountId,
      professionalId: appt.professionalId,
      previousPatientId: 'p-original',
      startAt: appt.startAt,
      releasedBy: 'patient',
    });

    // El job de la primera ronda corre ya, a las 03:00...
    await jest.advanceTimersByTimeAsync(0);

    // ...y NO manda nada: sólo se reprograma para las 7:00 (4 h después).
    expect(channel.sent).toHaveLength(0);
    expect(state.logs).toHaveLength(0);
    expect(appt.notifyRound).toBe(0);
    const [pending] = queue.pending();
    expect(pending.runAt).toBe(
      DateTime.fromISO('2026-08-05T07:00', { zone: TZ }).toMillis(),
    );

    // Avanzamos hasta las 7:00: ahí sí sale, con la ventana recalculada.
    await jest.advanceTimersByTimeAsync(4 * HOUR);

    expect(channel.sent).toHaveLength(1);
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].windowLabel).toBe('1_4h_secuencial');
    expect(appt.notifyRound).toBe(1);
  });

  it('a las 22:30 la notificación se corre a las 07:00 del día siguiente', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T22:30', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      startAt: DateTime.fromISO('2026-08-07T10:00', { zone: TZ }).toJSDate(),
    });
    const { service, channel, queue } = build({
      appointments: [appt],
      waitlist: [makeEntry()],
      logs: [],
    });

    await service.notifyNextCandidates(appt.id);

    expect(channel.sent).toHaveLength(0);
    expect(queue.pending()[0].runAt).toBe(
      DateTime.fromISO('2026-08-06T07:00', { zone: TZ }).toMillis(),
    );
  });

  it('nunca programa después del inicio del turno', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(DateTime.fromISO('2026-08-05T12:00', { zone: TZ }).toJSDate());

    const appt = makeAppt({
      // faltan 20 min: la ventana pide 10 min, pero si pidiera más se recorta
      startAt: DateTime.fromISO('2026-08-05T12:05', { zone: TZ }).toJSDate(),
    });
    const { service, queue } = build({ appointments: [appt], waitlist: [], logs: [] });

    await service.scheduleNext(appt.id, 10 * HOUR);
    expect(queue.pending()[0].runAt).toBe(appt.startAt.getTime());
  });

  it('appointment.cancelled cancela el job pendiente del motor', async () => {
    const appt = makeAppt({ startAt: new Date(Date.now() + 5 * HOUR) });
    const { service, queue } = build({ appointments: [appt], waitlist: [], logs: [] });

    await service.scheduleNext(appt.id, 60_000);
    expect(queue.pending()).toHaveLength(1);

    await service.onAppointmentCancelled({ appointmentId: appt.id, accountId: 'acc-1' });
    expect(queue.pending()).toHaveLength(0);
  });
});
