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
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RolesGuard } from '../common/roles.decorator';
import { RequestUser } from '../common/jwt.strategy';
import { ProfessionalsService } from '../professionals/professionals.service';
import { WaitlistService } from './waitlist.service';

class CreateWaitlistDto {
  @IsString() patientId!: string;
  @IsString() professionalId!: string;
  @IsOptional() @IsString() serviceTypeId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  preferredDaysOfWeek?: number[];
  @IsOptional() @IsString() linkedAppointmentId?: string;
}

// Vista del profesional sobre su lista de espera. El paciente NO usa estos
// endpoints: se anota por `/api/public/waitlist`, que toma el patientId del
// token en vez del body. Acá el profesional puede anotar a alguien a mano.
@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WaitlistController {
  constructor(
    private readonly svc: WaitlistService,
    private readonly professionals: ProfessionalsService,
  ) {}

  private assertAccess(user: RequestUser, professionalId: string) {
    return this.professionals.assertOwnedBy(
      professionalId,
      user.userId,
      user.accountId,
      user.roles.includes(Role.OWNER),
    );
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateWaitlistDto) {
    await this.assertAccess(user, dto.professionalId);
    return this.svc.create(dto);
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query('professionalId') professionalId: string,
  ) {
    await this.assertAccess(user, professionalId);
    return this.svc.listByProfessional(professionalId);
  }

  @Delete(':id')
  async cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const entry = await this.svc.get(id);
    await this.assertAccess(user, entry.professionalId);
    return this.svc.cancel(id);
  }
}
