import { AppointmentStatus } from '@prisma/client';
import { MemoryQueue } from '../queue/memory-queue';
import { JOB_NAMES } from '../queue/queue.types';
import { APPOINTMENT_EVENTS } from '../events/appointment.events';
import {
  autoCancelJobId,
  reminderJobId,
  RemindersService,
} from './reminders.service';
import type { OutboundMessage } from '../notifications/notification-channel';

// Unitarios de fase 5: cola en memoria (determinista, con introspección),
// canal mockeado y un doble de Prisma con un solo turno en un Map.

const TZ = 'America/Argentina/Buenos_Aires';
const NOW = new Date('2025-08-11T12:00:00.000Z'); // lunes
const HOUR = 3600_000;

interface FakeAppointment {
  id: string;
  status: AppointmentStatus;
  startAt: Date;
  autoCancelAt: Date | null;
  reminderSentAt: Date | null;
}

function setup(opts: { hoursAhead: number }) {
  const appointment: FakeAppointment = {
    id: 'appt-1',
    status: AppointmentStatus.SCHEDULED,
    startAt: new Date(NOW.getTime() + opts.hoursAhead * HOUR),
    autoCancelAt: null,
    reminderSentAt: null,
  };

  const prisma = {
    appointment: {
      findUnique: jest.fn(async () => ({
        ...appointment,
        patient: {
          id: 'pat-1',
          fullName: 'Juan Paciente',
          phone: '+5491111111111',
        },
        professional: { displayName: 'Dra. Ana' },
        account: { timezone: TZ, whatsappNumber: '+5491100000000' },
      })),
      update: jest.fn(async ({ data }: { data: Partial<FakeAppointment> }) => {
        Object.assign(appointment, data);
        return appointment;
      }),
    },
  };

  const sent: OutboundMessage[] = [];
  const channel = {
    name: 'SIMULATED' as const,
    send: jest.fn(async (msg: OutboundMessage) => {
      sent.push(msg);
      return {};
    }),
  };

  const appointments = {
    cancel: jest.fn(async (id: string) => {
      appointment.status = AppointmentStatus.AVAILABLE_FOR_REASSIGNMENT;
      return { id };
    }),
  };

  const queue = new MemoryQueue();
  const service = new RemindersService(
    prisma as never,
    appointments as never,
    queue,
    channel,
  );
  service.onModuleInit();

  return { service, queue, prisma, channel, appointments, appointment, sent };
}

describe('RemindersService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const created = (startAt: Date) => ({
    appointmentId: 'appt-1',
    accountId: 'acc-1',
    professionalId: 'pro-1',
    patientId: 'pat-1',
    startAt,
  });

  it('turno a 72 h: recordatorio a 48 h antes y auto-cancel a 24 h antes', async () => {
    const { service, queue, appointment } = setup({ hoursAhead: 72 });

    await service.onCreated(created(appointment.startAt));

    const pending = Object.fromEntries(
      queue.pending().map((j) => [j.id, j]),
    );
    const reminder = pending[reminderJobId('appt-1')];
    const autoCancel = pending[autoCancelJobId('appt-1')];

    expect(reminder.name).toBe(JOB_NAMES.APPOINTMENT_REMINDER);
    expect(autoCancel.name).toBe(JOB_NAMES.APPOINTMENT_AUTO_CANCEL);
    // 72h - 48h = corre dentro de 24 h; 72h - 24h = dentro de 48 h.
    expect(reminder.runAt).toBe(NOW.getTime() + 24 * HOUR);
    expect(autoCancel.runAt).toBe(NOW.getTime() + 48 * HOUR);

    // El deadline queda persistido: es el que se le comunica al paciente.
    expect(appointment.autoCancelAt).toEqual(
      new Date(appointment.startAt.getTime() - 24 * HOUR),
    );
  });

  it('el recordatorio dice la hora deadline literal en la TZ de la cuenta', async () => {
    const { service, queue, appointment, sent, channel } = setup({
      hoursAhead: 72,
    });
    await service.onCreated(created(appointment.startAt));

    // Avanzamos hasta que vence el job de recordatorio.
    jest.setSystemTime(NOW.getTime() + 24 * HOUR);
    await queue.drain();

    expect(channel.send).toHaveBeenCalledTimes(1);
    const msg = sent[0];
    expect(msg.kind).toBe('REMINDER');
    expect(msg.to).toBe('+5491111111111');
    expect(msg.fromAccountNumber).toBe('+5491100000000');
    expect(msg.buttons?.[0]).toEqual({
      id: 'confirm:appt-1',
      title: 'Confirmar asistencia',
    });
    // startAt = 2025-08-14T12:00Z → jueves 14/8 09:00 en Buenos Aires;
    // deadline 24 h antes → miércoles 13/8 09:00.
    expect(msg.body).toContain('jueves 14/8 a las 09:00');
    expect(msg.body).toContain(
      'si no confirmás antes del miércoles 13/8 a las 09:00',
    );
    expect(appointment.reminderSentAt).toBeInstanceOf(Date);
  });

  it('no manda recordatorio si el turno dejó de estar SCHEDULED', async () => {
    const { service, queue, appointment, channel } = setup({ hoursAhead: 72 });
    await service.onCreated(created(appointment.startAt));

    appointment.status = AppointmentStatus.CONFIRMED;
    jest.setSystemTime(NOW.getTime() + 24 * HOUR);
    await queue.drain();

    expect(channel.send).not.toHaveBeenCalled();
  });

  it('confirmar cancela el job de auto-cancelación', async () => {
    const { service, queue, appointment, appointments } = setup({
      hoursAhead: 72,
    });
    await service.onCreated(created(appointment.startAt));

    await service.onConfirmed({ appointmentId: 'appt-1' });

    expect(queue.pending().map((j) => j.id)).not.toContain(
      autoCancelJobId('appt-1'),
    );

    // Y aunque corramos toda la cola, nadie cancela el turno.
    jest.setSystemTime(NOW.getTime() + 48 * HOUR);
    await queue.drain();
    expect(appointments.cancel).not.toHaveBeenCalled();
  });

  it('sin confirmar: a las 24 h antes se cancela por el camino normal', async () => {
    const { service, queue, appointment, appointments, sent } = setup({
      hoursAhead: 72,
    });
    await service.onCreated(created(appointment.startAt));

    jest.setSystemTime(NOW.getTime() + 48 * HOUR);
    await queue.drain();

    // cancel(id, 'system') ⇒ mismo path que una cancelación manual ⇒ motor.
    expect(appointments.cancel).toHaveBeenCalledWith('appt-1', 'system');
    // Al paciente se le avisa que se cayó el turno.
    const last = sent[sent.length - 1];
    expect(last.body).toContain('cancelamos tu turno');
  });

  it('turno creado con 30 h de anticipación: recordatorio inmediato', async () => {
    const { service, queue, appointment, channel } = setup({ hoursAhead: 30 });
    await service.onCreated(created(appointment.startAt));

    const pending = Object.fromEntries(queue.pending().map((j) => [j.id, j]));
    // Recordatorio ya vencido ⇒ delay 0. Auto-cancel sigue a 24 h antes (en 6 h).
    expect(pending[reminderJobId('appt-1')].runAt).toBe(NOW.getTime());
    expect(pending[autoCancelJobId('appt-1')].runAt).toBe(
      NOW.getTime() + 6 * HOUR,
    );

    await queue.drain();
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('turno creado con menos de 24 h: no se programa nada', async () => {
    const { service, queue, appointment } = setup({ hoursAhead: 12 });
    await service.onCreated(created(appointment.startAt));

    expect(queue.pending()).toHaveLength(0);
    expect(appointment.autoCancelAt).toBeNull();
  });

  it('liberar o cancelar el turno da de baja los dos jobs', async () => {
    const { service, queue, appointment } = setup({ hoursAhead: 72 });
    await service.onCreated(created(appointment.startAt));

    await service.onReleased({
      appointmentId: 'appt-1',
      accountId: 'acc-1',
      professionalId: 'pro-1',
      previousPatientId: 'pat-1',
      startAt: appointment.startAt,
      releasedBy: 'patient',
    });

    expect(queue.pending()).toHaveLength(0);
  });

  it('reasignar reprograma ambos jobs para el paciente nuevo', async () => {
    const { service, queue, appointment } = setup({ hoursAhead: 72 });
    await service.onCreated(created(appointment.startAt));
    await service.onReleased({
      appointmentId: 'appt-1',
      accountId: 'acc-1',
      professionalId: 'pro-1',
      previousPatientId: 'pat-1',
      startAt: appointment.startAt,
      releasedBy: 'patient',
    });
    expect(queue.pending()).toHaveLength(0);

    await service.onReassigned({
      appointmentId: 'appt-1',
      newPatientId: 'pat-2',
      previousPatientId: 'pat-1',
      waitlistEntryId: 'wl-1',
    });

    expect(queue.pending().map((j) => j.id).sort()).toEqual([
      autoCancelJobId('appt-1'),
      reminderJobId('appt-1'),
    ]);
  });

  it('los eventos usan los nombres del contrato', () => {
    expect(APPOINTMENT_EVENTS.CREATED).toBe('appointment.created');
  });
});
