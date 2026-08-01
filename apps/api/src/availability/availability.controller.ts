import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RolesGuard } from '../common/roles.decorator';
import { RequestUser } from '../common/jwt.strategy';
import { AvailabilityService } from './availability.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { Role } from '@prisma/client';

class CreateSlotDto {
  @IsOptional() @IsInt() @Min(0) @Max(6) dayOfWeek?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) specificDate?: string;
  @IsString() @Matches(/^\d{2}:\d{2}$/) startTime!: string;
  @IsString() @Matches(/^\d{2}:\d{2}$/) endTime!: string;
}

@Controller('professionals/:professionalId/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AvailabilityController {
  constructor(
    private readonly svc: AvailabilityService,
    private readonly professionals: ProfessionalsService,
  ) {}

  private async assertAccess(user: RequestUser, professionalId: string) {
    await this.professionals.assertOwnedBy(
      professionalId,
      user.userId,
      user.accountId,
      user.roles.includes(Role.OWNER),
    );
  }

  @Get()
  async list(@CurrentUser() user: RequestUser, @Param('professionalId') pid: string) {
    await this.assertAccess(user, pid);
    return this.svc.list(pid);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('professionalId') pid: string,
    @Body() dto: CreateSlotDto,
  ) {
    await this.assertAccess(user, pid);
    return this.svc.create(pid, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('professionalId') pid: string,
    @Param('id') id: string,
  ) {
    await this.assertAccess(user, pid);
    return this.svc.remove(pid, id);
  }
}
