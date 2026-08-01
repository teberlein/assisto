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
import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { AppointmentOrigin, AppointmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RolesGuard } from '../common/roles.decorator';
import { RequestUser } from '../common/jwt.strategy';
import { AppointmentsService, CancelledBy } from './appointments.service';

class CreateAppointmentDto {
  @IsString() professionalId!: string;
  @IsString() serviceTypeId!: string;
  @IsString() patientId!: string;
  @IsDateString() startAt!: string;
  @IsEnum(AppointmentOrigin) origin!: AppointmentOrigin;
}

class ListAppointmentsQueryDto {
  @IsString() professionalId!: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  /** CSV de estados; vacío = todos (incluye los cupos liberados) */
  @IsOptional() @IsString() status?: string;
}

class CancelAppointmentQueryDto {
  @IsOptional() @IsIn(['professional', 'patient', 'system']) by?: CancelledBy;
}

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAppointmentDto) {
    return this.svc.create({ ...dto, expectedAccountId: user.accountId });
  }

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListAppointmentsQueryDto) {
    // Un usuario sólo ve la agenda de profesionales de su propia cuenta.
    await this.svc.assertProfessionalInAccount(query.professionalId, user.accountId);
    return this.svc.listByProfessional(query.professionalId, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      status: parseStatuses(query.status),
    });
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.getForAccount(id, user.accountId);
  }

  @Post(':id/confirm')
  async confirm(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.svc.getForAccount(id, user.accountId);
    return this.svc.confirm(id);
  }

  @Delete(':id')
  async cancel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: CancelAppointmentQueryDto,
  ) {
    await this.svc.getForAccount(id, user.accountId);
    return this.svc.cancel(id, query.by ?? 'professional');
  }
}

/** "SCHEDULED,CONFIRMED" → enum[]. Ignora valores desconocidos. */
function parseStatuses(csv?: string): AppointmentStatus[] | undefined {
  if (!csv) return undefined;
  const valid = Object.values(AppointmentStatus);
  const parsed = csv
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is AppointmentStatus => (valid as string[]).includes(s));
  return parsed.length > 0 ? parsed : undefined;
}
