import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';

/**
 * Catálogo público: no requiere auth de ningún tipo. Es lo que ve el paciente
 * al abrir el link de booking, antes de loguearse por OTP.
 */
@Controller('public')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class PublicCatalogController {
  constructor(private readonly svc: PublicService) {}

  @Get('accounts/:accountId/professionals')
  professionals(@Param('accountId') accountId: string) {
    return this.svc.listProfessionals(accountId);
  }

  @Get('professionals/:professionalId/service-types')
  serviceTypes(@Param('professionalId') professionalId: string) {
    return this.svc.listServiceTypes(professionalId);
  }
}
