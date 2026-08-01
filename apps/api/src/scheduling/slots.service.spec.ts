import { SlotsService } from './slots.service';

// Prisma mockeado a mano (objeto plano con jest.fn()) para no levantar Nest ni
// tocar la DB. Los tests fijan el reloj con fake timers porque el cálculo de
// slots descarta todo lo que arranca en el pasado.

const TZ = 'America/Argentina/Buenos_Aires';

interface MockRow {
  dayOfWeek: number | null;
  specificDate: Date | null;
  startTime: string;
  endTime: string;
}

function buildPrisma(opts: {
  timezone?: string;
  durationMinutes?: number;
  active?: boolean;
  availability: MockRow[];
  appointments?: { startAt: Date; endAt: Date }[];
}) {
  return {
    professional: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'prof-1',
        account: { timezone: opts.timezone ?? TZ },
      }),
    },
    serviceType: {
      findFirst: jest.fn().mockResolvedValue({
        durationMinutes: opts.durationMinutes ?? 30,
        active: opts.active ?? true,
      }),
    },
    availabilitySlot: {
      findMany: jest.fn().mockResolvedValue(opts.availability),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue(opts.appointments ?? []),
    },
  };
}

/** Helper: fecha UTC como Date. */
function utc(iso: string) {
  return new Date(iso);
}

function makeService(prisma: ReturnType<typeof buildPrisma>) {
  return new SlotsService(prisma as never);
}

describe('SlotsService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('genera slots de la duración del servicio dentro de la ventana y descarta el resto que no entra', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    // Lunes 2026-03-02, 09:00 a 10:20 en TZ Buenos Aires (UTC-3).
    const prisma = buildPrisma({
      durationMinutes: 30,
      availability: [{ dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '10:20' }],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-03-02',
      to: '2026-03-02',
    });

    // 09:00-09:30 y 09:30-10:00 entran; los 20 minutos sueltos del final no.
    expect(slots).toEqual([
      { startAt: '2026-03-02T12:00:00Z', endAt: '2026-03-02T12:30:00Z' },
      { startAt: '2026-03-02T12:30:00Z', endAt: '2026-03-02T13:00:00Z' },
    ]);
  });

  it('excluye los slots que se solapan con un turno existente', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 30,
      availability: [{ dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '10:30' }],
      appointments: [
        // 09:30-10:00 local = 12:30-13:00 UTC
        { startAt: utc('2026-03-02T12:30:00Z'), endAt: utc('2026-03-02T13:00:00Z') },
      ],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-03-02',
      to: '2026-03-02',
    });

    expect(slots.map((s) => s.startAt)).toEqual([
      '2026-03-02T12:00:00Z',
      '2026-03-02T13:00:00Z',
    ]);
  });

  it('un slot puntual (specificDate) pisa a los recurrentes de ese día', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 60,
      availability: [
        // Recurrente de los lunes: 09:00-11:00
        { dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '11:00' },
        // Puntual para ese lunes: 15:00-16:00 (debe ganar y anular al recurrente)
        {
          dayOfWeek: null,
          specificDate: utc('2026-03-02T00:00:00Z'),
          startTime: '15:00',
          endTime: '16:00',
        },
      ],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-03-02',
      to: '2026-03-02',
    });

    expect(slots).toEqual([
      { startAt: '2026-03-02T18:00:00Z', endAt: '2026-03-02T19:00:00Z' },
    ]);
  });

  it('el override puntual no afecta a los demás días', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 60,
      availability: [
        { dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '10:00' },
        {
          dayOfWeek: null,
          specificDate: utc('2026-03-02T00:00:00Z'),
          startTime: '15:00',
          endTime: '16:00',
        },
      ],
    });

    // 2026-03-02 y 2026-03-09 son lunes.
    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-03-02',
      to: '2026-03-09',
    });

    expect(slots.map((s) => s.startAt)).toEqual([
      '2026-03-02T18:00:00Z', // puntual
      '2026-03-09T12:00:00Z', // recurrente
    ]);
  });

  it('resuelve el offset día por día al cruzar un cambio de DST en Buenos Aires', async () => {
    // Argentina salió de horario de verano el 2009-03-15: antes UTC-2, después UTC-3.
    jest.useFakeTimers().setSystemTime(utc('2009-03-01T00:00:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 60,
      availability: [
        // Todos los días de la semana que nos interesan, 09:00-10:00 hora de pared.
        { dayOfWeek: 6, specificDate: null, startTime: '09:00', endTime: '10:00' }, // sábado
        { dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '10:00' }, // lunes
      ],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2009-03-14', // sábado, todavía UTC-2
      to: '2009-03-16', // lunes, ya UTC-3
    });

    // Misma hora de pared (09:00) → distinto instante UTC a cada lado del cambio.
    expect(slots.map((s) => s.startAt)).toEqual([
      '2009-03-14T11:00:00Z',
      '2009-03-16T12:00:00Z',
    ]);
  });

  it('mantiene el offset estable dentro del mismo régimen horario', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-01-01T00:00:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 60,
      availability: [{ dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '10:00' }],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-01-05', // lunes de enero (verano en el hemisferio sur)
      to: '2026-07-06', // lunes de julio (invierno)
    });

    // Sólo chequeamos que todos los lunes salgan a las 12:00Z (Argentina no
    // aplica DST desde 2009, así que el offset no debe moverse).
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.startAt.endsWith('T12:00:00Z'))).toBe(true);
  });

  it('no devuelve slots que ya arrancaron', async () => {
    // Ahora: lunes 2026-03-02 09:45 local (12:45 UTC).
    jest.useFakeTimers().setSystemTime(utc('2026-03-02T12:45:00Z'));

    const prisma = buildPrisma({
      durationMinutes: 30,
      availability: [{ dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '11:00' }],
    });

    const slots = await makeService(prisma).list({
      professionalId: 'prof-1',
      serviceTypeId: 'svc-1',
      from: '2026-03-02',
      to: '2026-03-02',
    });

    // 09:00 y 09:30 quedaron atrás; el de 10:00 en adelante sí.
    expect(slots.map((s) => s.startAt)).toEqual([
      '2026-03-02T13:00:00Z',
      '2026-03-02T13:30:00Z',
    ]);
  });

  it('devuelve vacío si el profesional no tiene disponibilidad cargada', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    const prisma = buildPrisma({ availability: [] });

    await expect(
      makeService(prisma).list({
        professionalId: 'prof-1',
        serviceTypeId: 'svc-1',
        from: '2026-03-02',
        to: '2026-03-02',
      }),
    ).resolves.toEqual([]);
  });

  it('rechaza un servicio que no es del profesional', async () => {
    jest.useFakeTimers().setSystemTime(utc('2026-03-01T00:00:00Z'));

    const prisma = buildPrisma({ availability: [] });
    prisma.serviceType.findFirst.mockResolvedValue(null);

    await expect(
      makeService(prisma).list({
        professionalId: 'prof-1',
        serviceTypeId: 'svc-ajeno',
        from: '2026-03-02',
        to: '2026-03-02',
      }),
    ).rejects.toThrow(/servicio/i);
  });
});
