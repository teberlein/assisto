import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list(professionalId: string) {
    return this.prisma.serviceType.findMany({
      where: { professionalId },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(professionalId: string, data: { name: string; durationMinutes: number }) {
    return this.prisma.serviceType.create({
      data: { professionalId, ...data },
    });
  }

  async update(
    professionalId: string,
    id: string,
    data: { name?: string; durationMinutes?: number; active?: boolean },
  ) {
    const st = await this.prisma.serviceType.findFirst({
      where: { id, professionalId },
    });
    if (!st) throw new NotFoundException();
    return this.prisma.serviceType.update({ where: { id }, data });
  }

  async remove(professionalId: string, id: string) {
    const st = await this.prisma.serviceType.findFirst({
      where: { id, professionalId },
    });
    if (!st) throw new NotFoundException();
    // Soft delete: desactivar en vez de borrar (hay FKs desde Appointment)
    return this.prisma.serviceType.update({
      where: { id },
      data: { active: false },
    });
  }
}
