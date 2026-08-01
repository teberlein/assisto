import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cliente HTTP de Kapso (fase 4, sec 8.1). Usa `fetch` nativo (Node 20+).
 *
 * Kapso expone dos superficies distintas y las dos usan la misma API key en el
 * header `X-API-Key` (verificado contra la cuenta real con un GET de lectura):
 *
 *  - **Management API** (`KAPSO_API_URL`, default `https://app.kapso.ai/api/v1`):
 *    `/projects`, `/whatsapp_configs`, etc. La usamos sólo para resolver el
 *    `phone_number_id` y el número de WhatsApp del negocio.
 *  - **Proxy de la Cloud API de Meta** (`KAPSO_WHATSAPP_API_URL`, default
 *    `https://api.kapso.ai/meta/whatsapp/v24.0`): `POST /{phone_number_id}/messages`
 *    con exactamente el mismo body que la API de Meta.
 *
 * Todo el armado del payload vive en `buildMessagePayload` — si Kapso cambia la
 * forma, se toca una sola función.
 */

/** Base del proxy de la Cloud API de Meta. */
const DEFAULT_WHATSAPP_API_URL = 'https://api.kapso.ai/meta/whatsapp/v24.0';
/** Base de la API de management de Kapso. */
const DEFAULT_MANAGEMENT_API_URL = 'https://app.kapso.ai/api/v1';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/** Límites duros de WhatsApp para mensajes interactivos. */
export const WA_LIMITS = {
  /** máximo de reply buttons por mensaje */
  MAX_BUTTONS: 3,
  /** máximo de caracteres del título de un botón / fila de lista */
  MAX_BUTTON_TITLE: 20,
  /** máximo de filas en una lista */
  MAX_LIST_ROWS: 10,
  /** máximo de caracteres del body */
  MAX_BODY: 1024,
} as const;

export interface KapsoButton {
  id: string;
  title: string;
}

export interface KapsoListRow {
  id: string;
  title: string;
  description?: string;
}

export interface KapsoSendResult {
  /** wamid del mensaje, para correlacionar la respuesta del webhook */
  messageId?: string;
}

/** Error tipado del cliente: distingue lo reintentable de lo definitivo. */
export class KapsoApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: unknown,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'KapsoApiError';
  }
}

/** Config de WhatsApp que devuelve `GET /whatsapp_configs`. */
export interface KapsoWhatsappConfig {
  id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  display_phone_number_normalized: string | null;
  name: string | null;
  kind: string | null;
}

@Injectable()
export class KapsoClient {
  private readonly logger = new Logger(KapsoClient.name);
  private readonly apiKey: string;
  private readonly whatsappUrl: string;
  private readonly managementUrl: string;
  private readonly configuredPhoneNumberId: string;

  /** cache de `phone_number_id` → número del negocio en E.164 */
  private numberByPhoneNumberId = new Map<string, string | null>();
  /** cache de la resolución perezosa del phone_number_id por defecto */
  private defaultPhoneNumberId: string | null = null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('KAPSO_API_KEY') ?? '';
    this.configuredPhoneNumberId =
      this.config.get<string>('KAPSO_PHONE_NUMBER_ID') ?? '';
    this.whatsappUrl = trimSlash(
      this.config.get<string>('KAPSO_WHATSAPP_API_URL') ??
        DEFAULT_WHATSAPP_API_URL,
    );
    // Si alguien apuntó KAPSO_API_URL al proxy de Meta por error, igual sirve
    // como base de management sólo si contiene /api/v1.
    this.managementUrl = trimSlash(
      this.config.get<string>('KAPSO_API_URL') ?? DEFAULT_MANAGEMENT_API_URL,
    );
  }

  /** ¿Hay credenciales cargadas? Si no, todo el canal es no-op. */
  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  // ---------- Envío ----------

  async sendText(to: string, body: string): Promise<KapsoSendResult> {
    return this.sendMessage(buildMessagePayload({ to, body }));
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: KapsoButton[],
  ): Promise<KapsoSendResult> {
    return this.sendMessage(buildMessagePayload({ to, body, buttons }));
  }

  async sendList(
    to: string,
    body: string,
    listLabel: string,
    rows: KapsoListRow[],
  ): Promise<KapsoSendResult> {
    return this.sendMessage(buildMessagePayload({ to, body, listLabel, rows }));
  }

  private async sendMessage(
    payload: Record<string, unknown>,
  ): Promise<KapsoSendResult> {
    if (!this.isConfigured) {
      throw new KapsoApiError('Falta KAPSO_API_KEY', null);
    }
    const phoneNumberId = await this.resolvePhoneNumberId();
    if (!phoneNumberId) {
      throw new KapsoApiError(
        'No pudimos resolver el phone_number_id de WhatsApp (configurá KAPSO_PHONE_NUMBER_ID)',
        null,
      );
    }

    const res = await this.request<{ messages?: Array<{ id?: string }> }>(
      'POST',
      `${this.whatsappUrl}/${phoneNumberId}/messages`,
      payload,
    );
    return { messageId: res?.messages?.[0]?.id };
  }

  // ---------- Management (sólo lectura) ----------

  /**
   * `phone_number_id` a usar para enviar. Prioriza el env; si no está, lo
   * resuelve una vez contra `GET /whatsapp_configs` y lo cachea en memoria.
   */
  async resolvePhoneNumberId(): Promise<string | null> {
    if (this.configuredPhoneNumberId) return this.configuredPhoneNumberId;
    if (this.defaultPhoneNumberId) return this.defaultPhoneNumberId;

    const configs = await this.listWhatsappConfigs().catch((err) => {
      this.logger.warn(`No pudimos listar whatsapp_configs: ${errText(err)}`);
      return [] as KapsoWhatsappConfig[];
    });
    this.defaultPhoneNumberId = configs[0]?.phone_number_id ?? null;
    return this.defaultPhoneNumberId;
  }

  async listWhatsappConfigs(): Promise<KapsoWhatsappConfig[]> {
    if (!this.isConfigured) return [];
    const res = await this.request<{ data?: KapsoWhatsappConfig[] }>(
      'GET',
      `${this.managementUrl}/whatsapp_configs`,
    );
    const configs = res?.data ?? [];
    for (const c of configs) {
      this.numberByPhoneNumberId.set(
        c.phone_number_id,
        toE164(c.display_phone_number_normalized ?? c.display_phone_number),
      );
    }
    return configs;
  }

  /**
   * Número de WhatsApp del negocio (E.164) para un `phone_number_id`.
   * Lo necesita el webhook para resolver a qué `Account` pertenece el mensaje.
   */
  async businessNumberFor(phoneNumberId: string): Promise<string | null> {
    if (this.numberByPhoneNumberId.has(phoneNumberId)) {
      return this.numberByPhoneNumberId.get(phoneNumberId) ?? null;
    }
    await this.listWhatsappConfigs().catch(() => undefined);
    return this.numberByPhoneNumberId.get(phoneNumberId) ?? null;
  }

  // ---------- Transporte ----------

  /** GET/POST con timeout, reintentos con backoff para 5xx/429 y errores tipados. */
  private async request<T>(
    method: 'GET' | 'POST',
    url: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: KapsoApiError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'X-API-Key': this.apiKey,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (res.ok) {
          const text = await res.text();
          return (text ? JSON.parse(text) : {}) as T;
        }

        const errorBody = await safeJson(res);
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new KapsoApiError(
          `Kapso respondió ${res.status} en ${method} ${redactUrl(url)}`,
          res.status,
          errorBody,
          retryable,
        );
        if (!retryable) throw lastError;

        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs(attempt),
        );
      } catch (err) {
        if (err instanceof KapsoApiError) {
          if (!err.retryable) throw err;
          lastError = err;
          continue;
        }
        // timeout / DNS / socket: reintentable
        lastError = new KapsoApiError(
          `Fallo de red hablando con Kapso: ${errText(err)}`,
          null,
          undefined,
          true,
        );
        if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
      }
    }

    throw lastError ?? new KapsoApiError('Fallo desconocido de Kapso', null);
  }
}

// ---------- Armado del payload (única fuente de verdad del shape) ----------

export interface BuildMessageInput {
  to: string;
  body: string;
  buttons?: KapsoButton[];
  listLabel?: string;
  rows?: KapsoListRow[];
}

/**
 * Traduce nuestro modelo a la forma de la Cloud API de Meta (que es lo que el
 * proxy de Kapso espera tal cual). Verificado contra
 * https://docs.kapso.ai/api/meta/whatsapp/messages/send-a-message
 */
export function buildMessagePayload(
  input: BuildMessageInput,
): Record<string, unknown> {
  const base = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsappNumber(input.to),
  };
  const body = truncate(input.body, WA_LIMITS.MAX_BODY);

  if (input.rows?.length && input.listLabel) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: body },
        action: {
          button: truncate(input.listLabel, WA_LIMITS.MAX_BUTTON_TITLE),
          sections: [
            {
              rows: input.rows.slice(0, WA_LIMITS.MAX_LIST_ROWS).map((r) => ({
                id: r.id,
                title: truncate(r.title, 24),
                ...(r.description
                  ? { description: truncate(r.description, 72) }
                  : {}),
              })),
            },
          ],
        },
      },
    };
  }

  if (input.buttons?.length) {
    return {
      ...base,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: input.buttons.slice(0, WA_LIMITS.MAX_BUTTONS).map((b) => ({
            type: 'reply',
            reply: {
              id: b.id,
              title: truncate(b.title, WA_LIMITS.MAX_BUTTON_TITLE),
            },
          })),
        },
      },
    };
  }

  return { ...base, type: 'text', text: { body, preview_url: false } };
}

// ---------- Helpers ----------

/** WhatsApp quiere el número sin `+` ni separadores. */
export function toWhatsappNumber(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

/** Normaliza a E.164 (con `+`) lo que venga del proveedor. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : null;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function backoffMs(attempt: number): number {
  // 400ms, 1200ms + jitter
  return 400 * 3 ** (attempt - 1) + Math.floor(Math.random() * 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Evita filtrar querystrings con credenciales en los logs. */
function redactUrl(url: string): string {
  const i = url.indexOf('?');
  return i === -1 ? url : url.slice(0, i);
}
