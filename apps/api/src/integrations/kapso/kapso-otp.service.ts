import { Injectable, Logger } from '@nestjs/common';
import { KapsoClient } from './kapso.client';

/**
 * Envío del OTP de paciente por WhatsApp (fase 4).
 *
 * `PatientAuthService` sigue siendo el dueño de generar, hashear y verificar el
 * código: acá sólo lo mandamos. La idea es que ese servicio inyecte esto y en el
 * branch `else` de `requestOtp` llame a `sendOtp(patient.phone, code)`.
 *
 * OJO producción: Meta exige **plantilla aprobada** para iniciar una
 * conversación fuera de la ventana de 24hs de servicio. Si el paciente no
 * escribió antes, un mensaje de texto libre lo rechaza WhatsApp. Cuando esté la
 * plantilla de autenticación aprobada hay que cambiar `sendText` por un envío
 * de `type: "template"` — es el único punto a tocar.
 */
@Injectable()
export class KapsoOtpService {
  private readonly logger = new Logger(KapsoOtpService.name);

  constructor(private readonly kapso: KapsoClient) {}

  /**
   * Manda el código al paciente. Devuelve el id del mensaje en el proveedor, o
   * null si no pudo (nunca tira: el login no debe romperse por un fallo de red).
   */
  async sendOtp(phone: string, code: string): Promise<string | null> {
    if (!this.kapso.isConfigured) {
      this.logger.warn(
        `No hay credenciales de Kapso: no se envió el OTP a ${phone}`,
      );
      return null;
    }

    try {
      const res = await this.kapso.sendText(
        phone,
        `Tu código para ingresar es ${code}. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.`,
      );
      return res.messageId ?? null;
    } catch (err) {
      this.logger.error(
        `No pudimos enviar el OTP a ${phone}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
