import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentOrigin, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Fase 1: sólo persistencia. Sin validación de disponibilidad, sin overlap check,
// sin motor de reasignación. Eso llega en fase 2/3.
@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    accountId: string;
    professionalId: string;
    serviceTypeId: string;
    patientId: string;
    startAt: string;
    origin: AppointmentOrigin;
  }) {
    const serviceType = await this.prisma.serviceType.findFirst({
      where: { id: input.serviceTypeId, professionalId: input.professionalId },
    });
    if (!serviceType) throw new BadRequestException('Invalid service type for this professional');

    const start = new Date(input.startAt);
    const end = new Date(start.getTime() + serviceType.durationMinutes * 60_000);

    return this.prisma.appointment.create({
      data: {
        accountId: input.accountId,
        professionalId: input.professionalId,
        serviceTypeId: input.serviceTypeId,
        patientId: input.patientId,
        startAt: start,
        endAt: end,
        status: AppointmentStatus.SCHEDULED,
        origin: input.origin,
      },
    });
  }

  listByProfessional(professionalId: string, from?: Date, to?: Date) {
    return this.prisma.appointment.findMany({
      where: {
        professionalId,
        startAt: { gte: from ?? undefined, lt: to ?? undefined },
      },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        serviceType: { select: { id: true, name: true, durationMinutes: true } },
      },
      orderBy: { startAt: 'asc' },
    });
  }

  async get(id: string) {
    const a = await this.prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, serviceType: true, professional: true },
    });
    if (!a) throw new NotFoundException();
    return a;
  }

  // Fase 1 stub: cancelación simple. En fase 2 esto pasa a estado
  // AVAILABLE_FOR_REASSIGNMENT y encola trabajo para el motor (fase 3).
  async cancel(id: string, by: 'professional' | 'patient' | 'system') {
    return this.prisma.appointment.update({
      where: { id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: by,
      },
    });
  }
}
