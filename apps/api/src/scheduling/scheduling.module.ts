import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { SlotsService } from './slots.service';
import { SlotsController } from './slots.controller';

/**
 * Reglas de agenda (cálculo de slots + validaciones). Lo consumen
 * AppointmentsService, el flujo público del paciente y —más adelante— el motor
 * de reasignación y el bot de WhatsApp.
 */
@Module({
  controllers: [SlotsController],
  providers: [SchedulingService, SlotsService],
  exports: [SchedulingService, SlotsService],
})
export class SchedulingModule {}
