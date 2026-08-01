/**
 * Seed de desarrollo. Corre con `pnpm --filter @asissto/api seed`.
 *
 * Idempotente por borrado + recreación: arranca limpiando las tablas en orden
 * inverso de dependencias y vuelve a insertar todo. No usa upsert porque los
 * ids son cuid autogenerados; para dev es preferible un estado reproducible a
 * conservar datos manuales.
 *
 * NO CORRER CONTRA UNA BASE QUE NO SEA DE DESARROLLO.
 */
import {
  AppointmentOrigin,
  AppointmentStatus,
  PrismaClient,
  Role,
  WaitlistStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

const TZ = 'America/Argentina/Buenos_Aires';
const PASSWORD = 'password123';

/** Próximo día de semana (1=lunes..5=viernes) a la hora indicada, en TZ de la cuenta. */
function nextWeekdayAt(daysAhead: number, hhmm: string): Date {
  const [hour, minute] = hhmm.split(':').map(Number);
  let dt = DateTime.now()
    .setZone(TZ)
    .plus({ days: daysAhead })
    .set({ hour, minute, second: 0, millisecond: 0 });
  // Corremos al lunes siguiente si cayó sábado (6) o domingo (7).
  while (dt.weekday > 5) dt = dt.plus({ days: 1 });
  return dt.toUTC().toJSDate();
}

function endOf(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * 60_000);
}

async function reset() {
  // Orden inverso de dependencias. Los onDelete: Cascade cubren varias, pero
  // ser explícito hace el script legible y a prueba de cambios de schema.
  await prisma.reassignmentEvent.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.availabilitySlot.deleteMany();
  await prisma.serviceType.deleteMany();
  await prisma.patientOtpChallenge.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.whatsappSession.deleteMany();
  await prisma.inboundEvent.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.user.deleteMany();
  await prisma.account.deleteMany();
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed no se corre en producción.');
  }

  await reset();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // -------- Cuenta --------
  const account = await prisma.account.create({
    data: {
      name: 'Consultorio Ana',
      timezone: TZ,
      whatsappNumber: '+5491100000000',
      planTier: 'starter',
    },
  });

  // -------- Owner (sin ficha de profesional) --------
  const owner = await prisma.user.create({
    data: {
      accountId: account.id,
      email: 'owner@test.com',
      passwordHash,
      fullName: 'Ana Gestión',
      roles: [Role.OWNER],
    },
  });

  // -------- Profesionales --------
  const anaUser = await prisma.user.create({
    data: {
      accountId: account.id,
      email: 'ana@test.com',
      passwordHash,
      fullName: 'Ana Pérez',
      roles: [Role.PROFESSIONAL],
    },
  });
  const ana = await prisma.professional.create({
    data: {
      accountId: account.id,
      userId: anaUser.id,
      displayName: 'Dra. Ana',
    },
  });

  const brunoUser = await prisma.user.create({
    data: {
      accountId: account.id,
      email: 'bruno@test.com',
      passwordHash,
      fullName: 'Bruno Díaz',
      roles: [Role.PROFESSIONAL],
    },
  });
  const bruno = await prisma.professional.create({
    data: {
      accountId: account.id,
      userId: brunoUser.id,
      displayName: 'Dr. Bruno',
    },
  });

  // -------- Tipos de servicio (duraciones distintas a propósito, para
  // ejercitar el cálculo de slots) --------
  const anaConsulta = await prisma.serviceType.create({
    data: { professionalId: ana.id, name: 'Consulta', durationMinutes: 30 },
  });
  const anaPrimera = await prisma.serviceType.create({
    data: {
      professionalId: ana.id,
      name: 'Primera consulta',
      durationMinutes: 60,
    },
  });
  const anaControl = await prisma.serviceType.create({
    data: { professionalId: ana.id, name: 'Control', durationMinutes: 45 },
  });

  const brunoSesion = await prisma.serviceType.create({
    data: { professionalId: bruno.id, name: 'Sesión', durationMinutes: 45 },
  });
  const brunoEval = await prisma.serviceType.create({
    data: {
      professionalId: bruno.id,
      name: 'Evaluación inicial',
      durationMinutes: 60,
    },
  });

  // -------- Disponibilidad recurrente lunes a viernes --------
  const weekdays = [1, 2, 3, 4, 5];
  await prisma.availabilitySlot.createMany({
    data: [
      // Ana: mañana y tarde.
      ...weekdays.map((dayOfWeek) => ({
        professionalId: ana.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '13:00',
      })),
      ...weekdays.map((dayOfWeek) => ({
        professionalId: ana.id,
        dayOfWeek,
        startTime: '15:00',
        endTime: '19:00',
      })),
      // Bruno: sólo tarde.
      ...weekdays.map((dayOfWeek) => ({
        professionalId: bruno.id,
        dayOfWeek,
        startTime: '14:00',
        endTime: '20:00',
      })),
    ],
  });

  // -------- Pacientes --------
  const patientsData = [
    { phone: '+5491111111111', fullName: 'Juan Paciente', email: 'juan@test.com' },
    { phone: '+5491122222222', fullName: 'Lucía Gómez', email: 'lucia@test.com' },
    { phone: '+5491133333333', fullName: 'Martín Sosa', email: null },
    { phone: '+5491144444444', fullName: 'Sofía Ruiz', email: 'sofia@test.com' },
    { phone: '+5491155555555', fullName: 'Diego Álvarez', email: null },
  ];
  const patients = [];
  for (const p of patientsData) {
    patients.push(
      await prisma.patient.create({
        data: { phone: p.phone, fullName: p.fullName, email: p.email },
      }),
    );
  }
  const [juan, lucia, martin, sofia, diego] = patients;

  // -------- Turnos futuros en varios estados --------

  // 1) SCHEDULED a ~3 días: entra al ciclo de recordatorio de fase 5.
  const start1 = nextWeekdayAt(3, '10:00');
  await prisma.appointment.create({
    data: {
      accountId: account.id,
      professionalId: ana.id,
      serviceTypeId: anaConsulta.id,
      patientId: juan.id,
      startAt: start1,
      endAt: endOf(start1, anaConsulta.durationMinutes),
      status: AppointmentStatus.SCHEDULED,
      origin: AppointmentOrigin.WEB,
    },
  });

  // 2) CONFIRMED a ~2 días: no debería auto-cancelarse.
  const start2 = nextWeekdayAt(2, '16:00');
  await prisma.appointment.create({
    data: {
      accountId: account.id,
      professionalId: ana.id,
      serviceTypeId: anaPrimera.id,
      patientId: lucia.id,
      startAt: start2,
      endAt: endOf(start2, anaPrimera.durationMinutes),
      status: AppointmentStatus.CONFIRMED,
      origin: AppointmentOrigin.WHATSAPP,
      confirmedAt: new Date(),
      reminderSentAt: new Date(),
      autoCancelAt: new Date(start2.getTime() - 24 * 3600_000),
    },
  });

  // 3) AVAILABLE_FOR_REASSIGNMENT a ~4 días: cupo liberado, listo para probar
  //    el motor a mano. patientId en null + previousPatientId cargado (sec 6.4).
  const start3 = nextWeekdayAt(4, '17:00');
  const liberado = await prisma.appointment.create({
    data: {
      accountId: account.id,
      professionalId: bruno.id,
      serviceTypeId: brunoSesion.id,
      patientId: null,
      previousPatientId: martin.id,
      startAt: start3,
      endAt: endOf(start3, brunoSesion.durationMinutes),
      status: AppointmentStatus.AVAILABLE_FOR_REASSIGNMENT,
      origin: AppointmentOrigin.WEB,
      cancelledAt: new Date(),
      cancelledBy: 'patient',
      releasedAt: new Date(),
    },
  });

  // 4) SCHEDULED de Sofía a ~10 días: es el turno "propio" que ella quiere
  //    adelantar (grupo 2 de la waitlist).
  const start4 = nextWeekdayAt(10, '18:00');
  const turnoSofia = await prisma.appointment.create({
    data: {
      accountId: account.id,
      professionalId: bruno.id,
      serviceTypeId: brunoEval.id,
      patientId: sofia.id,
      startAt: start4,
      endAt: endOf(start4, brunoEval.durationMinutes),
      status: AppointmentStatus.SCHEDULED,
      origin: AppointmentOrigin.WEB,
    },
  });

  // 5) CANCELLED definitivo, para ver que no aparezca en la agenda.
  const start5 = nextWeekdayAt(5, '11:00');
  await prisma.appointment.create({
    data: {
      accountId: account.id,
      professionalId: ana.id,
      serviceTypeId: anaControl.id,
      patientId: diego.id,
      startAt: start5,
      endAt: endOf(start5, anaControl.durationMinutes),
      status: AppointmentStatus.CANCELLED,
      origin: AppointmentOrigin.WHATSAPP,
      cancelledAt: new Date(),
      cancelledBy: 'professional',
    },
  });

  // -------- Waitlist: los dos grupos de prioridad (sec 6.3) --------

  // Grupo 1: sin turno agendado (linkedAppointmentId null). Se notifican primero.
  await prisma.waitlistEntry.create({
    data: {
      patientId: martin.id,
      professionalId: bruno.id,
      serviceTypeId: brunoSesion.id,
      preferredDaysOfWeek: [1, 3, 5],
      status: WaitlistStatus.ACTIVE,
    },
  });
  await prisma.waitlistEntry.create({
    data: {
      patientId: diego.id,
      professionalId: bruno.id,
      preferredDaysOfWeek: [], // vacío = cualquier día
      status: WaitlistStatus.ACTIVE,
    },
  });

  // Grupo 2: con turno propio, quiere adelantarlo.
  await prisma.waitlistEntry.create({
    data: {
      patientId: sofia.id,
      professionalId: bruno.id,
      serviceTypeId: brunoEval.id,
      preferredDaysOfWeek: [2, 4],
      linkedAppointmentId: turnoSofia.id,
      status: WaitlistStatus.ACTIVE,
    },
  });

  // -------- Resumen --------
  console.log(`
Seed listo.

Cuenta        : ${account.name}
accountId     : ${account.id}
timezone      : ${account.timezone}
WhatsApp      : ${account.whatsappNumber}

Usuarios (password: ${PASSWORD})
  OWNER         ${owner.email}
  PROFESSIONAL  ${anaUser.email}    → ${ana.displayName} (professionalId ${ana.id})
  PROFESSIONAL  ${brunoUser.email}  → ${bruno.displayName} (professionalId ${bruno.id})

Pacientes (login por OTP; en dev el código es OTP_DEV_CODE)
${patients.map((p) => `  ${p.phone}  ${p.fullName}`).join('\n')}

Turno liberado para probar el motor a mano:
  appointmentId ${liberado.id}
  ${bruno.displayName} · ${DateTime.fromJSDate(liberado.startAt).setZone(TZ).toFormat("cccc dd/LL HH:mm")}
  status AVAILABLE_FOR_REASSIGNMENT

Waitlist: 2 entradas del grupo 1 (sin turno) + 1 del grupo 2 (adelantamiento de ${sofia.fullName}).
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
