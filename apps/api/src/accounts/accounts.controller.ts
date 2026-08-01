import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, Roles, RolesGuard } from '../common/roles.decorator';
import { AccountsService } from './accounts.service';
import { RequestUser } from '../common/jwt.strategy';
import { Role } from '@prisma/client';

class UpdateAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
}

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.svc.get(user.accountId);
  }

  @Patch('me')
  @Roles(Role.OWNER)
  update(@CurrentUser() user: RequestUser, @Body() dto: UpdateAccountDto) {
    return this.svc.update(user.accountId, dto);
  }
}
