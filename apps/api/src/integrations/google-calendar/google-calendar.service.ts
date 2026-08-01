import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { decrypt, encrypt } from './crypto.util';

/**
 * Google Calendar por profesional (sec 8.2).
 *
 * **La fuente de verdad es nuestra DB; Google es un reflejo.** Nada de lo que
 * pase acá puede romper la operación local: el listener que llama a estos
 * métodos captura todo. Por eso los métodos loguean y devuelven en vez de
 * propagar cuando el problema es de Google.
 */

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * `google-auth-library` no es dependencia directa nuestra (viene adentro de
 * `googleapis`), así que derivamos el tipo del constructor en vez de importarlo.
 */
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
type OAuthTokens = Parameters<Parameters<OAuth2Client['on']>[1]>[0];
/** Ventana de validez del `state` del OAuth (anti-CSRF y anti-replay). */
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** ¿Están las credenciales de la app cargadas? Si no, todo es no-op. */
  get isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
        this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  // ---------- OAuth ----------

  private newOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
      this.config.get<string>('GOOGLE_REDIRECT_URI'),
    );
  }

  /**
   * URL de consentimiento. `access_type=offline` + `prompt=consent` son
   * obligatorios: sin los dos, Google deja de mandar el refresh token en las
   * reconexiones y nos quedamos sin poder renovar.
   */
  authorizeUrl(professionalId: string): string {
    if (!this.isConfigured) {
      throw new BadRequestException(
        'Google Calendar no está configurado en el servidor',
      );
    }
    return this.newOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      include_granted_scopes: true,
      state: this.signState(professionalId),
    });
  }

  /** Canjea el code, cifra el refresh token y lo guarda. */
  async connect(professionalId: string, code: string): Promise<void> {
    const client = this.newOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Pasa cuando el usuario ya había autorizado y Google no lo reenvía.
      throw new BadRequestException(
        'Google no nos devolvió el refresh token. Revocá el acceso en tu cuenta de Google y probá de nuevo.',
      );
    }

    await this.prisma.professional.update({
      where: { id: professionalId },
      data: {
        googleRefreshToken: encrypt(tokens.refresh_token, this.encryptionKey()),
        googleTokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
        googleSyncEnabled: true,
        googleCalendarId: 'primary',
      },
    });
    this.logger.log(`Profesional ${professionalId} conectó su Google Calendar`);
  }

  /** Desconecta: revoca en Google (best effort) y borra el token local. */
  async disconnect(professionalId: string): Promise<void> {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: { googleRefreshToken: true },
    });

    if (professional?.googleRefreshToken) {
      try {
        const token = decrypt(professional.googleRefreshToken, this.encryptionKey());
        await this.newOAuthClient().revokeToken(token);
      } catch (err) {
        this.logger.warn(
          `No pudimos revocar el token en Google: ${errText(err)} (igual lo borramos localmente)`,
        );
      }
    }

    await this.prisma.professional.update({
      where: { id: professionalId },
      data: {
        googleRefreshToken: null,
        googleTokenExpiry: null,
        googleSyncEnabled: false,
        googleCalendarId: null,
      },
    });
  }

  // ---------- `state` firmado (CSRF) ----------

  /** `professionalId.expiraEn.hmac` — ata el callback a quien inició el flujo. */
  signState(professionalId: string): string {
    const expiresAt = Date.now() + STATE_TTL_MS;
    const payload = `${professionalId}.${expiresAt}`;
    return `${payload}.${this.hmac(payload)}`;
  }

  /** Devuelve el professionalId si el state es válido; si no, tira. */
  verifyState(state: string | undefined): string {
    if (!state) throw new BadRequestException('Falta el parámetro state');
    const parts = state.split('.');
    if (parts.length !== 3) throw new BadRequestException('State inválido');

    const [professionalId, expiresAt, signature] = parts;
    const expected = this.hmac(`${professionalId}.${expiresAt}`);

    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('State inválido');
    }
    if (Number(expiresAt) < Date.now()) {
      throw new BadRequestException('El pedido de conexión venció, empezá de nuevo');
    }
    return professionalId;
  }

  private hmac(payload: string): string {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'change-me';
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  // ---------- Sincronización de turnos ----------

  /**
   * Crea o actualiza el evento del turno en el calendario del profesional y
   * guarda el `googleEventId`. No-op silencioso si el profesional no sincroniza.
   */
  async upsertEvent(appointmentId: string): Promise<void> {
    if (!this.isConfigured) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        professional: true,
        patient: true,
        serviceType: true,
        account: { select: { timezone: true } },
      },
    });
    if (!appointment) return;

    const auth = await this.authFor(appointment.professional);
    if (!auth) return;

    const calendarId = appointment.professional.googleCalendarId ?? 'primary';
    const calendar = google.calendar({ version: 'v3', auth });
    const timeZone = appointment.account.timezone;

    const requestBody = {
      summary: appointment.patient
        ? `${appointment.serviceType.name} — ${appointment.patient.fullName}`
        : `${appointment.serviceType.name} — cupo libre`,
      description: appointment.patient
        ? `Paciente: ${appointment.patient.fullName} (${appointment.patient.phone})\nAgendado desde Asissto.`
        : 'Cupo liberado, esperando reasignación (Asissto).',
      start: { dateTime: appointment.startAt.toISOString(), timeZone },
      end: { dateTime: appointment.endAt.toISOString(), timeZone },
      // Sólo invitamos si tenemos mail; con teléfono nomás Google rechaza.
      attendees: appointment.patient?.email
        ? [
            {
              email: appointment.patient.email,
              displayName: appointment.patient.fullName,
            },
          ]
        : [],
    };

    try {
      if (appointment.googleEventId) {
        await calendar.events.update({
          calendarId,
          eventId: appointment.googleEventId,
          requestBody,
        });
        return;
      }

      const created = await calendar.events.insert({ calendarId, requestBody });
      if (created.data.id) {
        await this.prisma.appointment.update({
          where: { id: appointmentId },
          data: { googleEventId: created.data.id },
        });
      }
    } catch (err) {
      // 404/410: el evento se borró del lado de Google. Limpiamos y reintentamos
      // como alta en la próxima sincronización.
      if (isGone(err) && appointment.googleEventId) {
        await this.prisma.appointment.update({
          where: { id: appointmentId },
          data: { googleEventId: null },
        });
      }
      throw err;
    }
  }

  /** Borra el evento del calendario y limpia el `googleEventId`. */
  async deleteEvent(appointmentId: string): Promise<void> {
    if (!this.isConfigured) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { professional: true },
    });
    if (!appointment?.googleEventId) return;

    const auth = await this.authFor(appointment.professional);
    if (!auth) return;

    const calendar = google.calendar({ version: 'v3', auth });
    try {
      await calendar.events.delete({
        calendarId: appointment.professional.googleCalendarId ?? 'primary',
        eventId: appointment.googleEventId,
      });
    } catch (err) {
      // Si ya no está, el objetivo se cumplió igual.
      if (!isGone(err)) throw err;
    }

    await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { googleEventId: null },
    });
  }

  // ---------- Credenciales por profesional ----------

  /**
   * Cliente OAuth con el refresh token descifrado. `googleapis` renueva el
   * access token solo cuando hace falta; nos enganchamos a `tokens` para
   * persistir el vencimiento.
   */
  private async authFor(professional: {
    id: string;
    googleSyncEnabled: boolean;
    googleRefreshToken: string | null;
  }): Promise<OAuth2Client | null> {
    if (!professional.googleSyncEnabled || !professional.googleRefreshToken) {
      return null;
    }

    let refreshToken: string;
    try {
      refreshToken = decrypt(professional.googleRefreshToken, this.encryptionKey());
    } catch (err) {
      this.logger.error(
        `No pudimos descifrar el refresh token de ${professional.id}: ${errText(err)}`,
      );
      return null;
    }

    const client = this.newOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    client.on('tokens', (tokens: OAuthTokens) => {
      if (!tokens.expiry_date) return;
      void this.prisma.professional
        .update({
          where: { id: professional.id },
          data: { googleTokenExpiry: new Date(tokens.expiry_date) },
        })
        .catch(() => undefined);
    });
    return client;
  }

  private encryptionKey(): string | undefined {
    return this.config.get<string>('ENCRYPTION_KEY');
  }
}

function isGone(err: unknown): boolean {
  const status = (err as { code?: number; status?: number } | null)?.code ??
    (err as { status?: number } | null)?.status;
  return status === 404 || status === 410;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
