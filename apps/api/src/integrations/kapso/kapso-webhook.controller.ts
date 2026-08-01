import {
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappFlowService } from './whatsapp-flow.service';
import { KapsoWebhookBody, normalizeInbound } from './kapso-webhook.types';

/** Headers que puede usar Kapso para la firma; aceptamos cualquiera. */
const SIGNATURE_HEADERS = [
  'x-webhook-signature',
  'x-kapso-signature',
  'x-hub-signature-256',
];

/**
 * Webhook entrante de Kapso (sec 8.1).
 *
 * Tres cosas importan acá:
 *  1. **Firma HMAC-SHA256** sobre el body crudo, comparada en tiempo constante.
 *  2. **Idempotencia**: Kapso reintenta. El `wamid` se guarda en `InboundEvent`
 *     con unique (provider, externalId); si ya estaba, contestamos 200 y listo.
 *  3. **Responder rápido**: 200 primero, procesamiento después. Si tardamos,
 *     Kapso reintenta y nos manda todo duplicado.
 *
 * No usa DTO de class-validator a propósito: el ValidationPipe global tiene
 * `forbidNonWhitelisted` y el payload de Kapso trae campos que no controlamos.
 * Leemos el body crudo con `@Req()`.
 */
@Controller('integrations/kapso')
export class KapsoWebhookController {
  private readonly logger = new Logger(KapsoWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly flow: WhatsappFlowService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  // Kapso puede mandar ráfagas; el límite global de 120/min es demasiado bajo.
  @Throttle({ default: { ttl: 60_000, limit: 600 } })
  async handle(@Req() req: Request): Promise<{ ok: true }> {
    const raw = rawBodyOf(req);
    this.assertValidSignature(req, raw);

    const body = (req.body ?? {}) as KapsoWebhookBody;
    const eventName = headerOf(req, 'x-webhook-event') ?? 'desconocido';
    const idempotencyKey = headerOf(req, 'x-idempotency-key');

    const inbound = normalizeInbound(body, idempotencyKey ?? undefined);
    if (!inbound) {
      // Status de entrega, ecos de salida, tipos que no manejamos: 200 y chau.
      this.logger.debug(`Evento ${eventName} ignorado (no es un entrante útil)`);
      return { ok: true };
    }

    // Idempotencia: el unique (provider, externalId) es el que decide.
    try {
      await this.prisma.inboundEvent.create({
        data: { provider: 'kapso', externalId: inbound.externalId },
      });
    } catch {
      this.logger.debug(`Evento ${inbound.externalId} ya procesado; lo salteamos`);
      return { ok: true };
    }

    // Fire-and-forget: contestamos 200 ya. `handleInbound` no tira nunca.
    void this.flow.handleInbound(inbound);

    return { ok: true };
  }

  /**
   * HMAC-SHA256 del body crudo con `KAPSO_WEBHOOK_SECRET`, en tiempo constante.
   * Si no hay secret configurado, no validamos (dev), pero avisamos.
   */
  private assertValidSignature(req: Request, raw: string): void {
    const secret = this.config.get<string>('KAPSO_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn(
        'KAPSO_WEBHOOK_SECRET vacío: el webhook está aceptando pedidos sin verificar la firma',
      );
      return;
    }

    const received = SIGNATURE_HEADERS.map((h) => headerOf(req, h)).find(Boolean);
    if (!received) throw new UnauthorizedException('Falta la firma del webhook');

    const expected = crypto
      .createHmac('sha256', secret)
      .update(raw, 'utf8')
      .digest('hex');

    // Kapso puede mandar "sha256=<hex>" o el hex pelado.
    const candidate = received.replace(/^sha256=/i, '').trim();

    const a = Buffer.from(candidate, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Firma del webhook inválida');
    }
  }
}

function headerOf(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' ? value : null;
}

/**
 * Body crudo tal como llegó.
 *
 * Requiere `NestFactory.create(AppModule, { rawBody: true })` en `main.ts`. Si
 * no está, caemos a re-serializar el body parseado — que es exactamente lo que
 * documenta Kapso ("HMAC sobre el JSON stringified payload"), aunque es frágil
 * ante diferencias de formato. Ver el reporte de fase 4.
 */
function rawBodyOf(req: Request): string {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (raw) return raw.toString('utf8');
  return JSON.stringify(req.body ?? {});
}
