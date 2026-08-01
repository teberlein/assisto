import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityRow, windowsInRange } from './availability-windows';

/** Slot disponible, siempre en ISO UTC. */
export interface AvailableSlot {
  startAt: string;
  endAt: string;
}

export interface ListSlotsInput {
  professionalId: string;
  serviceTypeId: string;
  /** "YYYY-MM-DD" (se interpreta en la TZ de la cuenta) o ISO completo */
  from: string;
  to: string;
}

/** Estados que ocupan la agenda del profesional. */
const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula los slots disponibles de un profesional para un servicio y un rango
   * de fechas. Todo el manejo de zona horaria pasa por luxon: `startTime` /
   * `endTime` son horas de pared ("HH:mm") en la TZ de la cuenta, así que el
   * offset se resuelve día por día (y por eso los cruces de DST salen bien).
   */
  async list(input: ListSlotsInput): Promise<AvailableSlot[]> {
    const professional = await this.prisma.professional.findUnique({
      where: { id: input.professionalId },
      select: { id: true, account: { select: { timezone: true } } },
    });
    if (!professional) throw new NotFoundException('No encontramos al profesional');

    const timezone = professional.account.timezone;

    const serviceType = await this.prisma.serviceType.findFirst({
      where: { id: input.serviceTypeId, professionalId: input.professionalId },
      select: { durationMinutes: true, active: true },
    });
    if (!serviceType) {
      throw new BadRequestException('El servicio no pertenece a este profesional');
    }
    if (!serviceType.active) {
      throw new BadRequestException('El servicio no está activo');
    }
    if (serviceType.durationMinutes <= 0) {
      throw new BadRequestException('El servicio tiene una duración inválida');
    }

    const from = parseDayBoundary(input.from, timezone, 'from');
    const to = parseDayBoundary(input.to, timezone, 'to');
    if (to < from) {
      throw new BadRequestException('El rango de fechas está invertido');
    }

    const rangeStart = from.startOf('day');
    const rangeEnd = to.endOf('day');

    const availability = (await this.prisma.availabilitySlot.findMany({
      where: { professionalId: input.professionalId },
      select: { dayOfWeek: true, specificDate: true, startTime: true, endTime: true },
    })) as AvailabilityRow[];
    if (availability.length === 0) return [];

    // Turnos que pisan el rango. Ojo: AVAILABLE_FOR_REASSIGNMENT no bloquea a
    // propósito — un cupo liberado está justamente disponible (sec 6.4).
    const busy = await this.prisma.appointment.findMany({
      where: {
        professionalId: input.professionalId,
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: rangeEnd.toJSDate() },
        endAt: { gt: rangeStart.toJSDate() },
      },
      select: { startAt: true, endAt: true },
    });
    const busyRanges = busy.map((b) => ({
      start: b.startAt.getTime(),
      end: b.endAt.getTime(),
    }));

    const now = Date.now();
    const windows = windowsInRange(availability, timezone, rangeStart, rangeEnd);
    const duration = serviceType.durationMinutes;
    const slots: AvailableSlot[] = [];

    for (const window of windows) {
      let cursor = window.start;
      // Paso = duración del servicio. El resto que no entra completo se descarta.
      while (cursor.plus({ minutes: duration }) <= window.end) {
        const slotStart = cursor;
        const slotEnd = cursor.plus({ minutes: duration });
        cursor = slotEnd;

        const startMs = slotStart.toMillis();
        const endMs = slotEnd.toMillis();

        // Fuera del rango pedido o ya pasado.
        if (startMs < rangeStart.toMillis() || startMs >= rangeEnd.toMillis()) continue;
        if (startMs < now) continue;

        const overlaps = busyRanges.some((b) => b.start < endMs && b.end > startMs);
        if (overlaps) continue;

        slots.push({
          startAt: slotStart.toUTC().toISO({ suppressMilliseconds: true }) ?? '',
          endAt: slotEnd.toUTC().toISO({ suppressMilliseconds: true }) ?? '',
        });
      }
    }

    return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
}

/** Acepta "YYYY-MM-DD" o un ISO completo; siempre resuelve en la TZ de la cuenta. */
function parseDayBoundary(value: string, timezone: string, field: string): DateTime {
  const dt = DateTime.fromISO(value, { zone: timezone });
  if (!dt.isValid) throw new BadRequestException(`La fecha "${field}" no es válida`);
  return dt;
}
