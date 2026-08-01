import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, RolesGuard } from '../common/roles.decorator';
import { RequestUser } from '../common/jwt.strategy';
import { ServiceTypesService } from './service-types.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { Role } from '@prisma/client';

class CreateServiceTypeDto {
  @IsString() name!: string;
  @IsInt() @Min(5) durationMinutes!: number;
}
class UpdateServiceTypeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(5) durationMinutes?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('professionals/:professionalId/service-types')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceTypesController {
  constructor(
    private readonly svc: ServiceTypesService,
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
  async list(@CurrentUser() user: RequestUser, @Param('professionalId') professionalId: string) {
    await this.assertAccess(user, professionalId);
    return this.svc.list(professionalId);
  }

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Param('professionalId') professionalId: string,
    @Body() dto: CreateServiceTypeDto,
  ) {
    await this.assertAccess(user, professionalId);
    return this.svc.create(professionalId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('professionalId') professionalId: string,
    @Param('id') id: string,
    @Body() dto: UpdateServiceTypeDto,
  ) {
    await this.assertAccess(user, professionalId);
    return this.svc.update(professionalId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('professionalId') professionalId: string,
    @Param('id') id: string,
  ) {
    await this.assertAccess(user, professionalId);
    return this.svc.remove(professionalId, id);
  }
}
