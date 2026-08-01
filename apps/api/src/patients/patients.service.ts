import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(data: { phone: string; fullName: string; email?: string }) {
    const existing = await this.prisma.patient.findUnique({ where: { phone: data.phone } });
    if (existing) throw new ConflictException('Phone already registered');
    return this.prisma.patient.create({ data });
  }

  async getByPhone(phone: string) {
    const p = await this.prisma.patient.findUnique({ where: { phone } });
    if (!p) throw new NotFoundException();
    return p;
  }

  async get(id: string) {
    const p = await this.prisma.patient.findUnique({ where: { id } });
    if (!p) throw new NotFoundException();
    return p;
  }
}
