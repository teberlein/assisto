import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  OutboundMessage,
  OutboundResult,
} from '../../notifications/notification-channel';
import { KapsoClient, WA_LIMITS } from './kapso.client';

/**
 * Canal real de WhatsApp (fase 4). Misma interfaz que `SimulatedChannel`, así
 * que el motor de reasignación no se entera de cuál está activo.
 *
 * Ojo: este archivo importa SOLO el archivo de tipos `notification-channel.ts`,
 * nunca `NotificationsModule` — si no, la dependencia sería circular.
 */
@Injectable()
export class KapsoChannel implements NotificationChannel {
  readonly name = 'WHATSAPP' as const;
  private readonly logger = new Logger(KapsoChannel.name);

  constructor(private readonly kapso: KapsoClient) {}

  async send(msg: OutboundMessage): Promise<OutboundResult> {
    // Con más de 3 opciones WhatsApp no acepta reply buttons: pasamos a lista.
    const buttons = msg.buttons ?? [];

    try {
      if (buttons.length > WA_LIMITS.MAX_BUTTONS) {
        const res = await this.kapso.sendList(
          msg.to,
          msg.body,
          'Ver opciones',
          buttons.map((b) => ({ id: b.id, title: b.title })),
        );
        return { externalId: res.messageId };
      }

      if (buttons.length > 0) {
        const res = await this.kapso.sendButtons(msg.to, msg.body, buttons);
        return { externalId: res.messageId };
      }

      const res = await this.kapso.sendText(msg.to, msg.body);
      return { externalId: res.messageId };
    } catch (err) {
      // El motor decide qué hacer con el fallo; acá sólo dejamos rastro.
      this.logger.error(
        `No pudimos enviar el mensaje ${msg.kind} a ${msg.to}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }
}
