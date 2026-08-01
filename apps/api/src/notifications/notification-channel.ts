// Contrato de canal de notificación (sec 6 / fase 3-4).
// El motor de reasignación NUNCA importa Kapso directamente: depende de esta
// interfaz. `SimulatedChannel` permite testear el motor completo sin red.
// En fase 4 `KapsoChannel` implementa lo mismo y se intercambia por env.

export type OutboundKind =
  | 'OTP'
  | 'REASSIGNMENT_OFFER'
  | 'REMINDER'
  | 'GENERIC';

export interface OutboundButton {
  /** id que vuelve en el webhook cuando el paciente toca el botón */
  id: string;
  title: string;
}

export interface OutboundMessage {
  /** teléfono destino en E.164 */
  to: string;
  kind: OutboundKind;
  body: string;
  buttons?: OutboundButton[];
  /** número de WhatsApp de la cuenta que envía (sec 5.1) */
  fromAccountNumber?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OutboundResult {
  /** id del mensaje en el proveedor, para correlacionar el webhook de respuesta */
  externalId?: string;
}

export interface NotificationChannel {
  readonly name: 'SIMULATED' | 'WHATSAPP';
  send(msg: OutboundMessage): Promise<OutboundResult>;
}

export const NOTIFICATION_CHANNEL = Symbol('NOTIFICATION_CHANNEL');
