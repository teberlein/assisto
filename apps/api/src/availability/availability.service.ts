import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseHm } from '../scheduling/availability-windows';

export interface CreateSlotInput {
  dayOfWeek?: number | null;
  specificDate?: string | null; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  list(professionalId: string) {
    return this.prisma.availabilitySlot.findMany({
      where: { professionalId },
      orderBy: [{ dayOfWeek: 'asc' }, { specificDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  create(professionalId: string, input: CreateSlotInput) {
    this.validate(input);
    return this.prisma.availabilitySlot.create({
      data: {
        professionalId,
        dayOfWeek: input.dayOfWeek ?? null,
        specificDate: input.specificDate ? new Date(input.specificDate) : null,
        startTime: input.startTime,
        endTime: input.endTime,
      },
    });
  }

  async remove(professionalId: string, id: string) {
    const s = await this.prisma.availabilitySlot.findFirst({ where: { id, professionalId } });
    if (!s) throw new NotFoundException();
    return this.prisma.availabilitySlot.delete({ where: { id } });
  }

  private validate(input: CreateSlotInput) {
    const hasDay = input.dayOfWeek !== null && input.dayOfWeek !== undefined;
    const hasDate = !!input.specificDate;
    if (hasDay === hasDate) {
      throw new BadRequestException('Set exactly one of dayOfWeek (recurring) or specificDate (one-off)');
    }
    if (hasDay && (input.dayOfWeek! < 0 || input.dayOfWeek! > 6)) {
      throw new BadRequestException('dayOfWeek must be 0..6');
    }
    // parseHm es el mismo parser que usa el cálculo de slots: acepta "HH:mm" y
    // además "24:00" como fin de día. Así no se puede guardar disponibilidad que
    // después SlotsService descarte en silencio.
    const start = parseHm(input.startTime);
    const end = parseHm(input.endTime);
    if (!start || !end) {
      throw new BadRequestException('startTime/endTime must be HH:mm');
    }
    if (start.hour === 24) {
      throw new BadRequestException('startTime cannot be 24:00');
    }
    // Comparación por minutos (no por string) para que "9:00" vs "10:00" no falle.
    if (start.hour * 60 + start.minute >= end.hour * 60 + end.minute) {
      throw new BadRequestException('startTime must be before endTime');
    }
  }
}
