import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOauthController } from './google-oauth.controller';
import { CalendarSyncListener } from './calendar-sync.listener';

/**
 * Google Calendar (sec 8.2): OAuth2 por profesional + espejo de los turnos.
 * El listener se suscribe por EventEmitter2, así que nadie tiene que importar
 * este módulo para que la sincronización funcione.
 */
@Module({
  controllers: [GoogleOauthController],
  providers: [GoogleCalendarService, CalendarSyncListener],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
