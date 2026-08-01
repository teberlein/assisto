// Tests unitarios de la confirmación (sec 6.4 / 6.7) con Prisma mockeado.
// La carrera REAL entre dos claims concurrentes se prueba contra Postgres en
// `reassignment.concurrency.spec.ts` — acá se verifica el contrato alrededor
// del update atómico: qué se persiste, qué se emite y qué recibe el que pierde.

import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MemoryQueue } from '../queue/memory-queue';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimService } from './claim.service';

const FUTURO = new Date(Date.now() + 3 * 3_600_000);

function buildPrisma(over: {
  appointment?: any;
  claimedRows?: any[];
  notificationLog?: any;
  waitlistEntry?: any;
}) {
  const tx = {
    notificationLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...(over.notificationLog ?? {}),
    },
    waitlistEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      ...(over.waitlistEntry ?? {}),
    },
    reassignmentEvent: { create: jest.fn().mockResolvedValue({}) },
    appointment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(over.appointment ?? null),
    },
  };

  const prisma = {
    appointment: {
      findUnique: jest.fn().mockResolvedValue(
        over.appointment ?? {
          id: 'appt-libre',
          status: 'AVAILABLE_FOR_REASSIGNMENT',
          startAt: FUTURO,
        },
      ),
    },
    notificationLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue(over.claimedRows ?? []),
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };

  return { prisma: prisma as unknown as PrismaService, raw: prisma, tx };
}

const filaGanadora = {
  id: 'appt-libre',
  accountId: 'acc-1',
  professionalId: 'prof-1',
  serviceTypeId: 'srv-1',
  patientId: 'p-nuevo',
  previousPatientId: 'p-original',
  startAt: FUTURO,
  endAt: new Date(FUTURO.getTime() + 1_800_000),
  status: 'SCHEDULED',
  origin: 'REASSIGNMENT',
};

describe('ClaimService (sec 6.4)', () => {
  it('turno inexistente → 404', async () => {
    const { prisma } = buildPrisma({ appointment: null });
    const svc = new ClaimService(prisma, new MemoryQueue(), new EventEmitter2());
    await expect(svc.claim('nope', 'p1', 'web')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('turno que ya empezó → conflicto', async () => {
    const { prisma } = buildPrisma({
      appointment: {
        id: 'a',
        status: 'AVAILABLE_FOR_REASSIGNMENT',
        startAt: new Date(Date.now() - 1000),
      },
    });
    const svc = new ClaimService(prisma, new MemoryQueue(), new EventEmitter2());
    await expect(svc.claim('a', 'p1', 'web')).rejects.toBeInstanceOf(ConflictException);
  });

  it('el que pierde la carrera recibe conflicto y queda logueado como LOST_RACE', async () => {
    const { prisma, raw } = buildPrisma({ claimedRows: [] }); // 0 filas actualizadas
    const svc = new ClaimService(prisma, new MemoryQueue(), new EventEmitter2());

    await expect(svc.claim('appt-libre', 'p-tarde', 'whatsapp')).rejects.toThrow(
      'El turno ya fue tomado',
    );
    expect(raw.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: 'appt-libre', patientId: 'p-tarde', response: null },
      data: expect.objectContaining({ response: 'LOST_RACE' }),
    });
    // No se creó ReassignmentEvent: no hay comisión para el que perdió.
    expect(raw.$transaction).not.toHaveBeenCalled();
  });

  it('el ganador queda con origin REASSIGNMENT, ReassignmentEvent y waitlist FULFILLED', async () => {
    const { prisma, raw, tx } = buildPrisma({
      claimedRows: [filaGanadora],
      waitlistEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'w-1',
          linkedAppointmentId: null,
          status: 'ACTIVE',
        }),
      },
    });
    const queue = new MemoryQueue();
    const events = new EventEmitter2();
    const reassigned = jest.fn();
    events.on('appointment.reassigned', reassigned);
    const svc = new ClaimService(prisma, queue, events);

    const res = await svc.claim('appt-libre', 'p-nuevo', 'web');

    expect(res.origin).toBe('REASSIGNMENT');
    expect(res.patientId).toBe('p-nuevo');
    expect(tx.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'w-1' },
      data: { status: 'FULFILLED' },
    });
    // sec 6.8: registro de facturación
    expect(tx.reassignmentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appointmentId: 'appt-libre',
        previousPatientId: 'p-original',
        newPatientId: 'p-nuevo',
        waitlistEntryId: 'w-1',
      }),
    });
    expect(tx.notificationLog.updateMany).toHaveBeenCalledWith({
      where: { appointmentId: 'appt-libre', patientId: 'p-nuevo', response: null },
      data: expect.objectContaining({ response: 'ACCEPTED' }),
    });
    expect(reassigned).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-libre', newPatientId: 'p-nuevo' }),
    );
    expect(raw.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('cancela el job pendiente del motor al reasignar', async () => {
    const { prisma } = buildPrisma({ claimedRows: [filaGanadora] });
    const queue = new MemoryQueue();
    const cancel = jest.spyOn(queue, 'cancel');
    const svc = new ClaimService(prisma, queue, new EventEmitter2());

    await svc.claim('appt-libre', 'p-nuevo', 'web');
    expect(cancel).toHaveBeenCalledWith('reassign:appt-libre');
  });

  // ---- sec 6.7 ----
  it('adelantamiento: libera el turno original y lo vuelve a meter al motor', async () => {
    const original = {
      id: 'appt-propio',
      accountId: 'acc-1',
      professionalId: 'prof-1',
      startAt: new Date(FUTURO.getTime() + 24 * 3_600_000),
    };
    const { prisma, tx } = buildPrisma({
      claimedRows: [filaGanadora],
      waitlistEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'w-adelanta',
          linkedAppointmentId: 'appt-propio',
          status: 'ACTIVE',
        }),
      },
      appointment: {
        id: 'appt-libre',
        status: 'AVAILABLE_FOR_REASSIGNMENT',
        startAt: FUTURO,
      },
    });
    tx.appointment.findUnique = jest.fn().mockResolvedValue(original);

    const events = new EventEmitter2();
    const released = jest.fn();
    events.on('appointment.released', released);
    const svc = new ClaimService(prisma, new MemoryQueue(), events);

    const res = await svc.claim('appt-libre', 'p-nuevo', 'web');

    expect(tx.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'appt-propio',
        patientId: 'p-nuevo',
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      data: expect.objectContaining({
        status: 'AVAILABLE_FOR_REASSIGNMENT',
        patientId: null,
        previousPatientId: 'p-nuevo',
        notifyRound: 0,
      }),
    });
    // Traza del adelantamiento en el turno tomado
    expect(tx.appointment.update).toHaveBeenCalledWith({
      where: { id: 'appt-libre' },
      data: { originalAppointmentId: 'appt-propio' },
    });
    // El cupo liberado vuelve al motor por el mismo camino que una cancelación
    expect(released).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'appt-propio',
        previousPatientId: 'p-nuevo',
        releasedBy: 'system',
      }),
    );
    expect(res.releasedOriginalAppointmentId).toBe('appt-propio');
  });

  it('no libera nada si el turno linkeado es el mismo que se está tomando', async () => {
    const { prisma, tx } = buildPrisma({
      claimedRows: [filaGanadora],
      waitlistEntry: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'w-1',
          linkedAppointmentId: 'appt-libre', // el suyo propio
          status: 'ACTIVE',
        }),
      },
    });
    const events = new EventEmitter2();
    const released = jest.fn();
    events.on('appointment.released', released);
    const svc = new ClaimService(prisma, new MemoryQueue(), events);

    await svc.claim('appt-libre', 'p-nuevo', 'web');

    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    expect(released).not.toHaveBeenCalled();
  });
});
