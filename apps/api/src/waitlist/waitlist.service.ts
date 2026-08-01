import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Fase 1: CRUD mínimo. La lógica de disparo/notificación (sec 6) llega en fase 3.
@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    patientId: string;
    professionalId: string;
    serviceTypeId?: string;
    preferredDaysOfWeek?: number[];
    linkedAppointmentId?: string;
  }) {
    return this.prisma.waitlistEntry.create({
      data: {
        patientId: input.patientId,
        professionalId: input.professionalId,
        serviceTypeId: input.serviceTypeId ?? null,
        preferredDaysOfWeek: input.preferredDaysOfWeek ?? [],
        linkedAppointmentId: input.linkedAppointmentId ?? null,
      },
    });
  }

  listByProfessional(professionalId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { professionalId, status: 'ACTIVE' },
      include: { patient: { select: { fullName: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  cancel(id: string) {
    return this.prisma.waitlistEntry.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
