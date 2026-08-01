import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityRow, windowsInRange } from './availability-windows';

/** Estados que ocupan la agenda del profesional (un cupo liberado no ocupa). */
const BLOCKING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

/**
 * Validaciones de agenda reusables. Vive acá y no en AppointmentsService para
 * que el motor de reasignación (fase 3) y el bot de WhatsApp (fase 4) usen
 * exactamente las mismas reglas sin importar el módulo de turnos.
 */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 409 si el rango pisa un turno SCHEDULED/CONFIRMED del mismo profesional. */
  async assertNoOverlap(
    professionalId: string,
    start: Date,
    end: Date,
    excludeAppointmentId?: string,
  ): Promise<void> {
    const clash = await this.prisma.appointment.findFirst({
      where: {
        professionalId,
        status: { in: BLOCKING_STATUSES },
        startAt: { lt: end },
        endAt: { gt: start },
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('Ese horario ya está ocupado por otro turno');
    }
  }

  /**
   * 400 si [start, end] no cae completo dentro de una única ventana de
   * disponibilidad del profesional (respetando la regla de override de los
   * slots puntuales sobre los recurrentes).
   */
  async assertWithinAvailability(professionalId: string, start: Date, end: Date): Promise<void> {
    const timezone = await this.timezoneOf(professionalId);

    const availability = (await this.prisma.availabilitySlot.findMany({
      where: { professionalId },
      select: { dayOfWeek: true, specificDate: true, startTime: true, endTime: true },
    })) as AvailabilityRow[];

    const from = DateTime.fromJSDate(start, { zone: timezone });
    const to = DateTime.fromJSDate(end, { zone: timezone });

    // Miramos también el día anterior: una ventana nocturna que termina a las
    // 24:00 arranca el día previo y podría contener el turno.
    const windows = windowsInRange(availability, timezone, from.minus({ days: 1 }), to);

    const startMs = start.getTime();
    const endMs = end.getTime();
    const fits = windows.some((w) => w.start.toMillis() <= startMs && w.end.toMillis() >= endMs);
    if (!fits) {
      throw new BadRequestException(
        'El horario elegido está fuera de la disponibilidad del profesional',
      );
    }
  }

  /** TZ de la cuenta a la que pertenece el profesional. */
  async timezoneOf(professionalId: string): Promise<string> {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: { account: { select: { timezone: true } } },
    });
    if (!professional) throw new NotFoundException('No encontramos al profesional');
    return professional.account.timezone;
  }
}
