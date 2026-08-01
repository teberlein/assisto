import { Module } from '@nestjs/common';
import { KapsoModule } from './kapso/kapso.module';
import { GoogleCalendarModule } from './google-calendar/google-calendar.module';

/**
 * Integraciones externas (fase 4, sec 8): WhatsApp vía Kapso y Google Calendar.
 *
 * Es sólo un agrupador para `AppModule`. `NotificationsModule` importa
 * `KapsoModule` directo (necesita `KapsoChannel` para elegir el canal por env),
 * así que este módulo no puede ser el único punto de entrada.
 */
@Module({
  imports: [KapsoModule, GoogleCalendarModule],
  exports: [KapsoModule, GoogleCalendarModule],
})
export class IntegrationsModule {}
