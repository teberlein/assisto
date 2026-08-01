/**
 * Forma del payload de los webhooks de Kapso (sec 8.1).
 *
 * Referencia: https://docs.kapso.ai/docs/platform/webhooks/message-events
 * El nombre del evento viaja en el header `X-Webhook-Event` (ej.
 * `whatsapp.message.received`), no en el body.
 *
 * Todo es opcional a propósito: el webhook es una superficie externa y no
 * queremos romper si Kapso agrega o mueve campos. La normalización a nuestro
 * modelo interno vive en `normalizeInbound`.
 */

export interface KapsoWebhookBody {
  message?: {
    id?: string;
    timestamp?: string;
    /** "text" | "interactive" | "button" | "image" | ... */
    type?: string;
    /** teléfono del paciente, sin `+` */
    from?: string;
    text?: { body?: string };
    interactive?: {
      type?: string;
      button_reply?: { id?: string; title?: string };
      list_reply?: { id?: string; title?: string };
    };
    /** quick reply de plantilla: el id viaja en `payload` */
    button?: { text?: string; payload?: string };
    kapso?: { direction?: string; content?: string };
  };
  conversation?: {
    id?: string;
    /** teléfono del paciente (el otro extremo de la conversación) */
    phone_number?: string;
    phone_number_id?: string;
  };
  /** id del número de WhatsApp del negocio que recibió el mensaje */
  phone_number_id?: string;
  [key: string]: unknown;
}

/** Mensaje entrante ya normalizado a lo único que nos importa. */
export interface InboundMessage {
  /** id del evento para idempotencia (wamid) */
  externalId: string;
  /** teléfono del paciente en E.164 */
  from: string;
  /** id del número de WhatsApp del negocio */
  phoneNumberId: string | null;
  /** texto libre, si fue un mensaje de texto */
  text: string | null;
  /** id del botón / fila de lista tocado, si fue una respuesta interactiva */
  buttonId: string | null;
}

/** Normaliza el body de Kapso. Devuelve null si el evento no nos interesa. */
export function normalizeInbound(
  body: KapsoWebhookBody,
  fallbackId?: string,
): InboundMessage | null {
  const msg = body.message;
  if (!msg) return null;

  // Los ecos de nuestros propios envíos no se procesan.
  if (msg.kapso?.direction === 'outbound') return null;

  const externalId = msg.id ?? fallbackId;
  if (!externalId) return null;

  const rawFrom = msg.from ?? body.conversation?.phone_number;
  const digits = (rawFrom ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;

  const buttonId =
    msg.interactive?.button_reply?.id ??
    msg.interactive?.list_reply?.id ??
    msg.button?.payload ??
    null;

  const text = msg.text?.body ?? msg.kapso?.content ?? null;

  return {
    externalId,
    from: `+${digits}`,
    phoneNumberId: body.phone_number_id ?? body.conversation?.phone_number_id ?? null,
    text: buttonId ? null : text,
    buttonId,
  };
}
