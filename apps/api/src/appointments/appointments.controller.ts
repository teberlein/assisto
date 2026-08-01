import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { AppointmentOrigin } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RolesGuard } from '../common/roles.decorator';
import { RequestUser } from '../common/jwt.strategy';
import { AppointmentsService } from './appointments.service';

class CreateAppointmentDto {
  @IsString() professionalId!: string;
  @IsString() serviceTypeId!: string;
  @IsString() patientId!: string;
  @IsDateString() startAt!: string;
  @IsEnum(AppointmentOrigin) origin!: AppointmentOrigin;
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAppointmentDto) {
    return this.svc.create({ ...dto, accountId: user.accountId });
  }

  @Get()
  list(
    @Query('professionalId') professionalId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listByProfessional(
      professionalId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Delete(':id')
  cancel(
    @Param('id') id: string,
    @Query('by') by?: 'professional' | 'patient' | 'system',
  ) {
    return this.svc.cancel(id, by ?? 'professional');
  }
}
