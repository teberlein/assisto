import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface JoinWaitlistInput {
  patientId: string;
  professionalId: string;
  serviceTypeId?: string;
  preferredDaysOfWeek?: number[];
  /** sec 6.2: "notificarme si se libera un turno antes" sobre un turno propio */
  linkedAppointmentId?: string;
}

/**
 * Lecturas y escrituras del flujo público del paciente. Todo lo que toca datos
 * de un paciente valida contra el `patientId` del token — nunca contra un id
 * que venga en el body.
 */
@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------- catálogo

  listProfessionals(accountId: string) {
    return this.prisma.professional.findMany({
      where: { accountId },
      select: { id: true, accountId: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });
  }

  listServiceTypes(professionalId: string) {
    return this.prisma.serviceType.findMany({
      where: { professionalId, active: true },
      select: { id: true, professionalId: true, name: true, durationMinutes: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ------------------------------------------------------------- waitlist

  async joinWaitlist(input: JoinWaitlistInput) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: input.professionalId },
      select: { id: true },
    });
    if (!professional) throw new NotFoundException('No encontramos al profesional');

    if (input.serviceTypeId) {
      const serviceType = await this.prisma.serviceType.findFirst({
        where: { id: input.serviceTypeId, professionalId: input.professionalId },
        select: { id: true },
      });
      if (!serviceType) {
        throw new BadRequestException('El servicio no pertenece a este profesional');
      }
    }

    if (input.linkedAppointmentId) {
      // Grupo de prioridad 2 (sec 6.3): sólo tiene sentido si el turno es del
      // paciente, sigue vivo y todavía no pasó.
      const linked = await this.prisma.appointment.findUnique({
        where: { id: input.linkedAppointmentId },
        select: { patientId: true, startAt: true, status: true },
      });
      if (!linked || linked.patientId !== input.patientId) {
        throw new NotFoundException('No encontramos ese turno');
      }
      if (linked.startAt.getTime() <= Date.now()) {
        throw new BadRequestException('Ese turno ya pasó');
      }
      if (
        linked.status !== AppointmentStatus.SCHEDULED &&
        linked.status !== AppointmentStatus.CONFIRMED
      ) {
        throw new BadRequestException('Ese turno ya no está activo');
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

  listMyWaitlist(patientId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { patientId, status: WaitlistStatus.ACTIVE },
      include: { professional: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async leaveWaitlist(id: string, patientId: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { id },
      select: { id: true, patientId: true },
    });
    if (!entry || entry.patientId !== patientId) {
      throw new NotFoundException('No encontramos esa inscripción');
    }
    return this.prisma.waitlistEntry.update({
      where: { id },
      data: { status: WaitlistStatus.CANCELLED },
    });
  }
}
