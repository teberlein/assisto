import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, Roles, RolesGuard } from '../common/roles.decorator';
import { ProfessionalsService } from './professionals.service';
import { RequestUser } from '../common/jwt.strategy';
import { Role } from '@prisma/client';

class CreateProfessionalDto {
  @IsString() displayName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() fullName!: string;
}

@Controller('professionals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProfessionalsController {
  constructor(private readonly svc: ProfessionalsService) {}

  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProfessionalDto) {
    return this.svc.create(user.accountId, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.svc.list(user.accountId);
  }

  @Get(':id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.svc.get(user.accountId, id);
  }
}
