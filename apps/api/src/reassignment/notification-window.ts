// Tabla de ritmo de notificación del motor de reasignación (sec 6.5).
//
// Función pura y sin dependencias: recibe cuántos milisegundos faltan para el
// turno y devuelve con qué modo, cada cuánto y a cuántos candidatos notificar.
// El motor la llama SIEMPRE en el momento de enviar, nunca en el momento de la
// cancelación (sec 6.5, último bullet).

export type NotifyMode = 'SEQUENTIAL' | 'BROADCAST';

export interface NotificationWindow {
  mode: NotifyMode;
  /** cuánto esperar hasta la próxima tanda de notificaciones */
  intervalMs: number;
  /** a cuántos candidatos se le manda en esta tanda */
  batchSize: number;
  /** etiqueta que se persiste en NotificationLog.windowLabel */
  label: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Piso absoluto de 10 minutos (sec 6.5). Se aplica a TODAS las ventanas, no
 * sólo a la de broadcast: nunca mandamos dos tandas separadas por menos de esto.
 */
export const MIN_INTERVAL_MS = 10 * MINUTE;

/**
 * Cuántos candidatos reciben la oferta a la vez cuando falta menos de 1 h.
 *
 * El spec dice "broadcast simultáneo a varios candidatos" sin fijar el número.
 * Elegimos 5 porque: (a) con menos de una hora la tasa de respuesta cae fuerte
 * y notificar de a uno con piso de 10 min sólo alcanzaría a ~5 personas antes
 * de que el turno arranque, así que mandarlos juntos no cambia el volumen total
 * de WhatsApps pero sí multiplica la chance de que alguien lo tome; (b) es
 * chico como para no quemar toda la lista de espera en una cancelación; (c) el
 * costo de que varios acepten a la vez ya está cubierto por el update atómico
 * de sec 6.4 (el que pierde recibe LOST_RACE, no un turno duplicado).
 */
export const BROADCAST_BATCH_SIZE = 5;

/**
 * Resuelve la ventana de sec 6.5.
 *
 * Donde el spec da un rango (12–24 h, 3–6 h, 1–2 h, 10–15 min) tomamos siempre
 * el **extremo inferior**: notificar antes recorre más candidatos antes de que
 * el turno arranque, y el cupo perdido es plata perdida para el profesional.
 *
 * Bordes: cada banda incluye su límite inferior ("2–7 días" cubre exactamente
 * 7 días y exactamente 2 días; "24–48 h" cubre exactamente 24 h), salvo la
 * primera que es estrictamente "más de 7 días".
 */
export function resolveWindow(msUntilAppointment: number): NotificationWindow {
  const ms = msUntilAppointment;

  if (ms > 7 * DAY) {
    return win('SEQUENTIAL', 12 * HOUR, 1, 'mas_7d_secuencial');
  }
  if (ms >= 2 * DAY) {
    return win('SEQUENTIAL', 3 * HOUR, 1, '2_7d_secuencial');
  }
  if (ms >= 24 * HOUR) {
    return win('SEQUENTIAL', 1 * HOUR, 1, '24_48h_secuencial');
  }
  if (ms >= 4 * HOUR) {
    return win('SEQUENTIAL', 30 * MINUTE, 1, '4_24h_secuencial');
  }
  if (ms >= 1 * HOUR) {
    return win('SEQUENTIAL', 10 * MINUTE, 1, '1_4h_secuencial');
  }
  // Menos de 1 h (incluye tiempos negativos, aunque el motor corta antes si el
  // turno ya empezó): broadcast a varios candidatos a la vez.
  return win('BROADCAST', 10 * MINUTE, BROADCAST_BATCH_SIZE, 'menos_1h_broadcast');
}

function win(
  mode: NotifyMode,
  intervalMs: number,
  batchSize: number,
  label: string,
): NotificationWindow {
  return {
    mode,
    intervalMs: Math.max(MIN_INTERVAL_MS, intervalMs),
    batchSize,
    label,
  };
}
