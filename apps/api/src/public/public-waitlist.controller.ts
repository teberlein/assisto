import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CurrentPatient, PatientJwtGuard, RequestPatient } from '../common/patient-jwt.guard';
import { PublicService } from './public.service';

class JoinWaitlistDto {
  @IsString() professionalId!: string;
  @IsOptional() @IsString() serviceTypeId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  preferredDaysOfWeek?: number[];
  /** sec 6.2: turno propio sobre el que se pide "avisame si se libera antes" */
  @IsOptional() @IsString() linkedAppointmentId?: string;
}

/** Lista de espera del paciente (sec 6.2). Opt-in explícito, nunca automático. */
@Controller('public/waitlist')
@UseGuards(PatientJwtGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class PublicWaitlistController {
  constructor(private readonly svc: PublicService) {}

  @Post()
  join(@CurrentPatient() patient: RequestPatient, @Body() dto: JoinWaitlistDto) {
    return this.svc.joinWaitlist({ ...dto, patientId: patient.patientId });
  }

  @Get()
  mine(@CurrentPatient() patient: RequestPatient) {
    return this.svc.listMyWaitlist(patient.patientId);
  }

  @Delete(':id')
  leave(@CurrentPatient() patient: RequestPatient, @Param('id') id: string) {
    return this.svc.leaveWaitlist(id, patient.patientId);
  }
}
