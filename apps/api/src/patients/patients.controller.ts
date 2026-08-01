import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { PatientsService } from './patients.service';

class RegisterPatientDto {
  // E.164 relajado; endurecer en fase 4 con el formato de Kapso
  @IsString() @Matches(/^\+\d{8,15}$/) phone!: string;
  @IsString() fullName!: string;
  @IsOptional() @IsEmail() email?: string;
}

@Controller('patients')
export class PatientsController {
  constructor(private readonly svc: PatientsService) {}

  // Registro público — vía link web (sec 3, 5.1)
  @Post('register')
  register(@Body() dto: RegisterPatientDto) {
    return this.svc.register(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }
}
