import * as crypto from 'crypto';

/**
 * Cifrado en reposo de secretos de terceros (AES-256-GCM).
 *
 * Resuelve la deuda técnica de guardar el refresh token de Google en claro:
 * `Professional.googleRefreshToken` se persiste siempre con `encrypt()`.
 *
 * Formato: `iv:tag:ciphertext`, las tres partes en base64. IV aleatorio de 12
 * bytes por valor (nunca reusado) y tag de autenticación de 16 bytes, así que
 * un token manipulado en la DB falla al descifrar en vez de pasar silencioso.
 *
 * La clave viene de `ENCRYPTION_KEY`: 32 bytes en hex (`openssl rand -hex 32`).
 */

const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionError';
  }
}

/** Valida y normaliza la key. Tira si está mal configurada (falla temprano). */
export function resolveKey(hexKey: string | undefined): Buffer {
  if (!hexKey) {
    throw new EncryptionError('Falta ENCRYPTION_KEY');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new EncryptionError(
      'ENCRYPTION_KEY tiene que ser 32 bytes en hexadecimal (64 caracteres)',
    );
  }
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new EncryptionError('ENCRYPTION_KEY inválida');
  }
  return key;
}

export function encrypt(plaintext: string, hexKey: string | undefined): string {
  const key = resolveKey(hexKey);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decrypt(payload: string, hexKey: string | undefined): string {
  const key = resolveKey(hexKey);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new EncryptionError('El valor cifrado no tiene el formato iv:tag:ciphertext');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Tag inválido: o cambió la key, o alguien tocó la fila.
    throw new EncryptionError('No pudimos descifrar el valor (clave o dato inválidos)');
  }
}
