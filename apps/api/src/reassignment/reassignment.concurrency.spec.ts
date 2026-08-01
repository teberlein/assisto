// Tests de concurrencia REALES contra Postgres (sec 6.4 / 6.7).
//
// El "primero en confirmar gana" no se puede probar con Prisma mockeado: lo que
// se está verificando es el comportamiento del motor de la base ante dos UPDATE
// condicionales sobre la misma fila. Por eso estos tests necesitan una DB viva.
//
// ── Cómo correrlos ────────────────────────────────────────────────────────────
//   pnpm docker:up
//   cd apps/api && pnpm prisma migrate deploy       # o `prisma migrate dev`
//   RUN_DB_TESTS=1 npx jest --rootDir src reassignment.concurrency
//
// En Windows (PowerShell):
//   $env:RUN_DB_TESTS='1'; npx jest --rootDir src reassignment.concurrency
//
// Sin `RUN_DB_TESTS=1` (o sin DATABASE_URL) el bloque queda en `describe.skip`,
// así la suite del repo corre verde en cualquier máquina y en CI sin Postgres.

import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient } from '@prisma/client';
import { MemoryQueue } from '../queue/memory-queue';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimService } from './claim.service';

const DB_TESTS_ENABLED =
  process.env.RUN_DB_TESTS === '1' && !!process.env.DATABASE_URL;

const describeDb = DB_TESTS_ENABLED ? describe : describe.skip;

const SUFFIX = `test-${Date.now()}`;
const HOUR = 3_600_000;

describeDb('Motor de reasignación — concurrencia contra Postgres', () => {
  let prisma: PrismaClient;
  let claims: ClaimService;
  let queue: MemoryQueue;
  let events: EventEmitter2;

  const ids = {
    account: `acc-${SUFFIX}`,
    user: `usr-${SUFFIX}`,
    professional: `prof-${SUFFIX}`,
    serviceType: `srv-${SUFFIX}`,
  };
  const createdPatients: string[] = [];
  const createdAppointments: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    queue = new MemoryQueue();
    events = new EventEmitter2();
    claims = new ClaimService(prisma as unknown as PrismaService, queue, events);

    await prisma.account.create({
      data: {
        id: ids.account,
        name: `Cuenta ${SUFFIX}`,
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    await prisma.user.create({
      data: {
        id: ids.user,
        accountId: ids.account,
        email: `owner-${SUFFIX}@test.local`,
        passwordHash: 'x',
        fullName: 'Owner de prueba',
        roles: ['OWNER'],
      },
    });
    await prisma.professional.create({
      data: {
        id: ids.professional,
        accountId: ids.account,
        userId: ids.user,
        displayName: 'Dra. Test',
      },
    });
    await prisma.serviceType.create({
      data: {
        id: ids.serviceType,
        professionalId: ids.professional,
        name: 'Consulta',
        durationMinutes: 30,
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.reassignmentEvent.deleteMany({
      where: { appointmentId: { in: createdAppointments } },
    });
    await prisma.notificationLog.deleteMany({
      where: { appointmentId: { in: createdAppointments } },
    });
    await prisma.waitlistEntry.deleteMany({
      where: { professionalId: ids.professional },
    });
    await prisma.appointment.deleteMany({ where: { accountId: ids.account } });
    await prisma.patient.deleteMany({ where: { id: { in: createdPatients } } });
    await prisma.serviceType.deleteMany({ where: { id: ids.serviceType } });
    await prisma.professional.deleteMany({ where: { id: ids.professional } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.account.deleteMany({ where: { id: ids.account } });
    await prisma.$disconnect();
  });

  let seq = 0;

  async function nuevoPaciente() {
    seq += 1;
    const id = `pat-${SUFFIX}-${seq}`;
    createdPatients.push(id);
    await prisma.patient.create({
      data: {
        id,
        phone: `+5491${String(Date.now()).slice(-8)}${String(seq).padStart(2, '0')}`,
        fullName: `Paciente ${seq}`,
      },
    });
    return id;
  }

  async function cupoLiberado(offsetMs = 5 * HOUR) {
    seq += 1;
    const id = `appt-libre-${SUFFIX}-${seq}`;
    createdAppointments.push(id);
    const startAt = new Date(Date.now() + offsetMs);
    await prisma.appointment.create({
      data: {
        id,
        accountId: ids.account,
        professionalId: ids.professional,
        serviceTypeId: ids.serviceType,
        patientId: null,
        previousPatientId: await nuevoPaciente(),
        startAt,
        endAt: new Date(startAt.getTime() + 30 * 60_000),
        status: 'AVAILABLE_FOR_REASSIGNMENT',
        origin: 'WEB',
        releasedAt: new Date(),
      },
    });
    return id;
  }

  it('dos claim() simultáneos: uno gana, el otro recibe conflicto', async () => {
    const appointmentId = await cupoLiberado();
    const [a, b] = [await nuevoPaciente(), await nuevoPaciente()];

    const results = await Promise.all([
      claims.claim(appointmentId, a, 'web').catch((e) => e),
      claims.claim(appointmentId, b, 'whatsapp').catch((e) => e),
    ]);

    const ganadores = results.filter((r) => !(r instanceof Error));
    const perdedores = results.filter((r) => r instanceof ConflictException);
    expect(ganadores).toHaveLength(1);
    expect(perdedores).toHaveLength(1);
    expect((perdedores[0] as ConflictException).message).toBe('El turno ya fue tomado');

    const final = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(final.status).toBe('SCHEDULED');
    expect(final.origin).toBe('REASSIGNMENT');
    expect([a, b]).toContain(final.patientId);

    // sec 6.8: exactamente un evento de facturación por reasignación.
    const eventos = await prisma.reassignmentEvent.findMany({ where: { appointmentId } });
    expect(eventos).toHaveLength(1);
  });

  it('broadcast: varios respondedores en paralelo, exactamente uno gana', async () => {
    const appointmentId = await cupoLiberado(30 * 60_000); // <1h → modo broadcast
    const pacientes = await Promise.all(
      Array.from({ length: 5 }, () => nuevoPaciente()),
    );

    const results = await Promise.all(
      pacientes.map((p) => claims.claim(appointmentId, p, 'whatsapp').catch((e) => e)),
    );

    expect(results.filter((r) => !(r instanceof Error))).toHaveLength(1);
    expect(results.filter((r) => r instanceof ConflictException)).toHaveLength(4);

    const eventos = await prisma.reassignmentEvent.findMany({ where: { appointmentId } });
    expect(eventos).toHaveLength(1);
  });

  it('el que pierde queda con NotificationResponse.LOST_RACE en su log', async () => {
    const appointmentId = await cupoLiberado();
    const ganador = await nuevoPaciente();
    const perdedor = await nuevoPaciente();

    // Ambos habían sido notificados por el motor.
    const entradas = await Promise.all(
      [ganador, perdedor].map((patientId) =>
        prisma.waitlistEntry.create({
          data: { patientId, professionalId: ids.professional },
        }),
      ),
    );
    await Promise.all(
      entradas.map((e) =>
        prisma.notificationLog.create({
          data: {
            appointmentId,
            waitlistEntryId: e.id,
            patientId: e.patientId,
            channel: 'SIMULATED',
            windowLabel: '4_24h_secuencial',
          },
        }),
      ),
    );

    await claims.claim(appointmentId, ganador, 'web');
    await expect(claims.claim(appointmentId, perdedor, 'web')).rejects.toBeInstanceOf(
      ConflictException,
    );

    const logs = await prisma.notificationLog.findMany({ where: { appointmentId } });
    const delGanador = logs.find((l) => l.patientId === ganador);
    const delPerdedor = logs.find((l) => l.patientId === perdedor);
    expect(delGanador?.response).toBe('ACCEPTED');
    expect(delPerdedor?.response).toBe('LOST_RACE');
  });

  // ---- sec 6.7 ----
  it('adelantamiento: al reclamar, el turno original vuelve a AVAILABLE_FOR_REASSIGNMENT', async () => {
    const paciente = await nuevoPaciente();
    const cupo = await cupoLiberado(3 * HOUR);

    // El paciente ya tiene un turno más tarde y pidió que le avisen si se libera antes.
    seq += 1;
    const propioId = `appt-propio-${SUFFIX}-${seq}`;
    createdAppointments.push(propioId);
    const propioStart = new Date(Date.now() + 48 * HOUR);
    await prisma.appointment.create({
      data: {
        id: propioId,
        accountId: ids.account,
        professionalId: ids.professional,
        serviceTypeId: ids.serviceType,
        patientId: paciente,
        startAt: propioStart,
        endAt: new Date(propioStart.getTime() + 30 * 60_000),
        status: 'SCHEDULED',
        origin: 'WEB',
      },
    });
    await prisma.waitlistEntry.create({
      data: {
        patientId: paciente,
        professionalId: ids.professional,
        linkedAppointmentId: propioId,
      },
    });

    const releasedEvents: any[] = [];
    events.on('appointment.released', (ev) => releasedEvents.push(ev));

    const res = await claims.claim(cupo, paciente, 'web');
    expect(res.releasedOriginalAppointmentId).toBe(propioId);

    const original = await prisma.appointment.findUniqueOrThrow({
      where: { id: propioId },
    });
    expect(original.status).toBe('AVAILABLE_FOR_REASSIGNMENT');
    expect(original.patientId).toBeNull();
    expect(original.previousPatientId).toBe(paciente);
    expect(original.releasedAt).not.toBeNull();

    // El cupo liberado vuelve a entrar al motor por el mismo camino (sec 6.1).
    expect(releasedEvents.map((e) => e.appointmentId)).toContain(propioId);

    // Y el turno tomado guarda la referencia al original (sec 7).
    const tomado = await prisma.appointment.findUniqueOrThrow({ where: { id: cupo } });
    expect(tomado.originalAppointmentId).toBe(propioId);
    expect(tomado.origin).toBe('REASSIGNMENT');
  });
});

// Recordatorio visible cuando la suite corre sin DB.
if (!DB_TESTS_ENABLED) {
  describe('Motor de reasignación — concurrencia', () => {
    it.todo(
      'requiere Postgres: correr con RUN_DB_TESTS=1 (ver instrucciones arriba del archivo)',
    );
  });
}
