import { Module } from '@nestjs/common';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { AppointmentsModule } from '../../appointments/appointments.module';
import { ReassignmentModule } from '../../reassignment/reassignment.module';
import { KapsoClient } from './kapso.client';
import { KapsoChannel } from './kapso.channel';
import { KapsoOtpService } from './kapso-otp.service';
import { KapsoWebhookController } from './kapso-webhook.controller';
import { WhatsappFlowService } from './whatsapp-flow.service';

/**
 * Integración con Kapso / WhatsApp (sec 8.1).
 *
 * **No importa `NotificationsModule`**: sería circular (NotificationsModule
 * importa este módulo para poder elegir `KapsoChannel` por env). `KapsoChannel`
 * depende sólo del archivo de tipos `notification-channel.ts`.
 */
@Module({
  imports: [SchedulingModule, AppointmentsModule, ReassignmentModule],
  controllers: [KapsoWebhookController],
  providers: [KapsoClient, KapsoChannel, KapsoOtpService, WhatsappFlowService],
  exports: [KapsoClient, KapsoChannel, KapsoOtpService],
})
export class KapsoModule {}
