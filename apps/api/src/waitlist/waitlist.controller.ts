import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { WaitlistService } from './waitlist.service';

class CreateWaitlistDto {
  @IsString() patientId!: string;
  @IsString() professionalId!: string;
  @IsOptional() @IsString() serviceTypeId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  preferredDaysOfWeek?: number[];
  @IsOptional() @IsString() linkedAppointmentId?: string;
}

@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly svc: WaitlistService) {}

  @Post()
  create(@Body() dto: CreateWaitlistDto) {
    return this.svc.create(dto);
  }

  @Get()
  list(@Query('professionalId') professionalId: string) {
    return this.svc.listByProfessional(professionalId);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }
}
