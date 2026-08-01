import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AppointmentOrigin } from '@prisma/client';
import { IsDateString, IsString } from 'class-validator';
import { CurrentPatient, PatientJwtGuard, RequestPatient } from '../common/patient-jwt.guard';
import { AppointmentsService } from '../appointments/appointments.service';

class CreatePublicAppointmentDto {
  @IsString() professionalId!: string;
  @IsString() serviceTypeId!: string;
  @IsDateString() startAt!: string;
}

/**
 * Turnos del paciente por web (sec 5.2). El `patientId` sale siempre del token
 * de paciente, nunca del body.
 */
@Controller('public')
@UseGuards(PatientJwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class PublicAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('appointments')
  create(@CurrentPatient() patient: RequestPatient, @Body() dto: CreatePublicAppointmentDto) {
    return this.appointments.create({
      professionalId: dto.professionalId,
      serviceTypeId: dto.serviceTypeId,
      startAt: dto.startAt,
      patientId: patient.patientId,
      origin: AppointmentOrigin.WEB,
    });
  }

  /** Todos los turnos del paciente, futuros y pasados (más nuevo primero). */
  @Get('me/appointments')
  mine(@CurrentPatient() patient: RequestPatient) {
    return this.appointments.listByPatient(patient.patientId);
  }

  @Delete('appointments/:id')
  async cancel(@CurrentPatient() patient: RequestPatient, @Param('id') id: string) {
    await this.appointments.getForPatient(id, patient.patientId);
    return this.appointments.cancel(id, 'patient');
  }
}
