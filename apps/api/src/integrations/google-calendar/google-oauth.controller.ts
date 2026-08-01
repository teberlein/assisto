import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/roles.decorator';
import { RequestUser } from '../../common/jwt.strategy';
import { GoogleCalendarService } from './google-calendar.service';

/**
 * OAuth2 de Google Calendar por profesional (sec 8.2).
 *
 * El callback lo abre Google en el browser, así que **no** puede pedir JWT: la
 * atadura al profesional viaja en el `state` firmado con HMAC que emitimos en
 * `/authorize` (que sí exige JWT). Eso es lo que evita el CSRF de "pegame tu
 * cuenta de Google en el calendario de otro".
 */
@Controller('integrations/google')
export class GoogleOauthController {
  constructor(
    private readonly google: GoogleCalendarService,
    private readonly config: ConfigService,
  ) {}

  /** Devuelve la URL de consentimiento para que el frontend redirija. */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  authorize(@CurrentUser() user: RequestUser) {
    if (!user.professionalId) {
      throw new BadRequestException(
        'Sólo un profesional puede conectar su calendario',
      );
    }
    return { url: this.google.authorizeUrl(user.professionalId) };
  }

  /** Redirect URI registrado en Google. Sin auth: valida por `state`. */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) return this.redirect(res, `error=${encodeURIComponent(error)}`);

    const professionalId = this.google.verifyState(state);
    if (!code) return this.redirect(res, 'error=missing_code');

    try {
      await this.google.connect(professionalId, code);
      this.redirect(res, 'google=conectado');
    } catch (err) {
      this.redirect(
        res,
        `error=${encodeURIComponent(
          err instanceof Error ? err.message : 'fallo_conexion',
        )}`,
      );
    }
  }

  /** Desconecta el calendario del profesional autenticado. */
  @Delete('connection')
  @UseGuards(JwtAuthGuard)
  async disconnect(@CurrentUser() user: RequestUser) {
    if (!user.professionalId) {
      throw new BadRequestException('No sos un profesional');
    }
    await this.google.disconnect(user.professionalId);
    return { disconnected: true };
  }

  /** Vuelve al panel web con el resultado en la query. */
  private redirect(res: Response, query: string): void {
    const base = (
      this.config.get<string>('WEB_URL') ??
      this.config.get<string>('CORS_ORIGINS')?.split(',')[0]?.trim() ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    res.redirect(`${base}/panel/integraciones?${query}`);
  }
}
