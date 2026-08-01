import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// CRUD de la lista de espera (sec 6.2). La selección de a quién se notifica vive
// en el motor (`reassignment/candidate-selector.ts`, sec 6.3).
@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    patientId: string;
    professionalId: string;
    serviceTypeId?: string;
    preferredDaysOfWeek?: number[];
    linkedAppointmentId?: string;
  }) {
    // Grupo 2 (sec 6.3): "notificarme si se libera un turno antes" sólo tiene
    // sentido sobre un turno propio y todavía vivo. Si no se valida acá, el
    // motor termina ofreciendo adelantamientos contra turnos ajenos.
    if (input.linkedAppointmentId) {
      const linked = await this.prisma.appointment.findUnique({
        where: { id: input.linkedAppointmentId },
        select: { patientId: true, professionalId: true, status: true },
      });
      if (!linked || linked.patientId !== input.patientId) {
        throw new BadRequestException('El turno indicado no es tuyo');
      }
      if (linked.professionalId !== input.professionalId) {
        throw new BadRequestException(
          'El turno indicado es de otro profesional',
        );
      }
      if (linked.status !== 'SCHEDULED' && linked.status !== 'CONFIRMED') {
        throw new BadRequestException('El turno indicado ya no está activo');
      }
    }

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

  async get(id: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new BadRequestException('La entrada de lista de espera no existe');
    }
    return entry;
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
