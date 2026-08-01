import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsISO8601, IsString } from 'class-validator';
import { DateTime } from 'luxon';
import { SlotsService } from './slots.service';

/** Máximo de días que se pueden pedir de una: evita barridos de agenda completos. */
const MAX_RANGE_DAYS = 60;

class ListSlotsQueryDto {
  @IsString() serviceTypeId!: string;
  @IsISO8601() from!: string;
  @IsISO8601() to!: string;
}

/**
 * Endpoint público (sin auth): lo consumen tanto el booking web del paciente
 * —antes de que se loguee por OTP— como el bot de WhatsApp. Por eso lleva un
 * throttle más agresivo que el global (120/min): 30 req/min por IP.
 */
@Controller('professionals/:professionalId/slots')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list(@Param('professionalId') professionalId: string, @Query() query: ListSlotsQueryDto) {
    const from = DateTime.fromISO(query.from);
    const to = DateTime.fromISO(query.to);
    if (!from.isValid || !to.isValid) {
      throw new BadRequestException('Las fechas "from" y "to" deben ser ISO 8601');
    }
    if (to < from) {
      throw new BadRequestException('El rango de fechas está invertido');
    }
    if (to.diff(from, 'days').days > MAX_RANGE_DAYS) {
      throw new BadRequestException(`El rango no puede superar los ${MAX_RANGE_DAYS} días`);
    }

    return this.slots.list({
      professionalId,
      serviceTypeId: query.serviceTypeId,
      from: query.from,
      to: query.to,
    });
  }
}
