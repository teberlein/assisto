import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NOTIFICATION_CHANNEL, NotificationChannel } from './notification-channel';
import { SimulatedChannel } from './simulated.channel';
import { KapsoModule } from '../integrations/kapso/kapso.module';
import { KapsoChannel } from '../integrations/kapso/kapso.channel';

/**
 * Elige la implementación del canal por env (NOTIFICATION_CHANNEL).
 * El resto de la app inyecta NOTIFICATION_CHANNEL y no sabe cuál está activa.
 */
@Global()
@Module({
  imports: [KapsoModule],
  providers: [
    SimulatedChannel,
    {
      provide: NOTIFICATION_CHANNEL,
      inject: [ConfigService, SimulatedChannel, KapsoChannel],
      useFactory: (
        config: ConfigService,
        simulated: SimulatedChannel,
        kapso: KapsoChannel,
      ): NotificationChannel =>
        config.get<string>('NOTIFICATION_CHANNEL') === 'whatsapp'
          ? kapso
          : simulated,
    },
  ],
  exports: [NOTIFICATION_CHANNEL, SimulatedChannel],
})
export class NotificationsModule {}
