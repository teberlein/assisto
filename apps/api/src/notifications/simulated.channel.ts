import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  OutboundMessage,
  OutboundResult,
} from './notification-channel';

/**
 * Canal de test (fase 3): no sale a la red. Loguea y devuelve un id sintético.
 * Permite ejercitar el motor de reasignación completo sin Kapso.
 */
@Injectable()
export class SimulatedChannel implements NotificationChannel {
  readonly name = 'SIMULATED' as const;
  private readonly logger = new Logger('SimulatedChannel');
  private seq = 0;

  /** Mensajes enviados, para aserciones en tests. */
  readonly sent: OutboundMessage[] = [];

  async send(msg: OutboundMessage): Promise<OutboundResult> {
    this.sent.push(msg);
    const buttons = msg.buttons?.map((b) => b.title).join(' | ') ?? '';
    this.logger.log(
      `[SIMULATED ${msg.kind}] to=${msg.to} :: ${msg.body}${buttons ? ` :: [${buttons}]` : ''}`,
    );
    return { externalId: `sim-${++this.seq}` };
  }
}
