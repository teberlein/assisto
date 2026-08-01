import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import {
  CurrentPatient,
  PatientJwtGuard,
  RequestPatient,
} from '../common/patient-jwt.guard';
import { ClaimService } from './claim.service';
import { ReassignmentService } from './reassignment.service';

class OpenSlotsQuery {
  @IsOptional() @IsString() professionalId?: string;
}

@Controller()
export class ReassignmentController {
  constructor(
    private readonly claims: ClaimService,
    private readonly reassignment: ReassignmentService,
  ) {}

  /**
   * Confirmación de un cupo liberado desde la web (sec 6.4).
   * WhatsApp llega al mismo `ClaimService.claim()` desde el webhook de fase 4:
   * la lógica no se duplica por canal.
   */
  @UseGuards(PatientJwtGuard)
  @Post('appointments/:id/claim')
  claim(@Param('id') id: string, @CurrentPatient() patient: RequestPatient) {
    return this.claims.claim(id, patient.patientId, 'web');
  }

  /**
   * Cupos liberados y todavía disponibles. Endpoint abierto: sec 6.4 dice que el
   * turno está disponible para cualquiera desde el instante cero — la lista de
   * espera da ventaja de tiempo (te avisan), no exclusividad.
   */
  @Get('public/open-slots')
  openSlots(@Query() query: OpenSlotsQuery) {
    return this.reassignment.listOpenSlots(query.professionalId);
  }
}
