// Tests unitarios puros de la tabla de sec 6.5. Sin DB, sin Nest.

import {
  BROADCAST_BATCH_SIZE,
  MIN_INTERVAL_MS,
  resolveWindow,
} from './notification-window';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('resolveWindow (sec 6.5)', () => {
  it('más de 7 días → secuencial cada 12 h (extremo inferior de 12–24 h)', () => {
    const w = resolveWindow(10 * DAY);
    expect(w.mode).toBe('SEQUENTIAL');
    expect(w.intervalMs).toBe(12 * HOUR);
    expect(w.batchSize).toBe(1);
    expect(w.label).toBe('mas_7d_secuencial');
  });

  it('2–7 días → secuencial cada 3 h', () => {
    for (const ms of [7 * DAY, 5 * DAY, 2 * DAY]) {
      const w = resolveWindow(ms);
      expect(w.mode).toBe('SEQUENTIAL');
      expect(w.intervalMs).toBe(3 * HOUR);
      expect(w.label).toBe('2_7d_secuencial');
    }
  });

  it('24–48 h → secuencial cada 1 h', () => {
    for (const ms of [47 * HOUR, 30 * HOUR, 24 * HOUR]) {
      const w = resolveWindow(ms);
      expect(w.intervalMs).toBe(1 * HOUR);
      expect(w.label).toBe('24_48h_secuencial');
    }
  });

  it('4–24 h → secuencial cada 30 min', () => {
    for (const ms of [23 * HOUR, 12 * HOUR, 4 * HOUR]) {
      const w = resolveWindow(ms);
      expect(w.intervalMs).toBe(30 * MINUTE);
      expect(w.label).toBe('4_24h_secuencial');
    }
  });

  it('1–4 h → secuencial cada 10 min (extremo inferior de 10–15 min)', () => {
    for (const ms of [3 * HOUR + 59 * MINUTE, 2 * HOUR, 1 * HOUR]) {
      const w = resolveWindow(ms);
      expect(w.mode).toBe('SEQUENTIAL');
      expect(w.intervalMs).toBe(10 * MINUTE);
      expect(w.label).toBe('1_4h_secuencial');
    }
  });

  it('menos de 1 h → broadcast simultáneo con piso de 10 min', () => {
    for (const ms of [59 * MINUTE, 20 * MINUTE, 1 * MINUTE]) {
      const w = resolveWindow(ms);
      expect(w.mode).toBe('BROADCAST');
      expect(w.intervalMs).toBe(10 * MINUTE);
      expect(w.batchSize).toBe(BROADCAST_BATCH_SIZE);
      expect(w.batchSize).toBeGreaterThan(1);
      expect(w.label).toBe('menos_1h_broadcast');
    }
  });

  it('el piso absoluto de 10 min se respeta en todas las ventanas', () => {
    const samples = [30 * DAY, 3 * DAY, 36 * HOUR, 10 * HOUR, 2 * HOUR, 5 * MINUTE, 0, -1];
    for (const ms of samples) {
      expect(resolveWindow(ms).intervalMs).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    }
  });

  it('tiempo negativo (turno ya empezado) cae en broadcast, no rompe', () => {
    expect(resolveWindow(-5 * HOUR).mode).toBe('BROADCAST');
  });

  it('los bordes no dejan huecos: cada banda incluye su límite inferior', () => {
    expect(resolveWindow(7 * DAY).label).toBe('2_7d_secuencial');
    expect(resolveWindow(7 * DAY + 1).label).toBe('mas_7d_secuencial');
    expect(resolveWindow(2 * DAY).label).toBe('2_7d_secuencial');
    expect(resolveWindow(2 * DAY - 1).label).toBe('24_48h_secuencial');
    expect(resolveWindow(24 * HOUR).label).toBe('24_48h_secuencial');
    expect(resolveWindow(24 * HOUR - 1).label).toBe('4_24h_secuencial');
    expect(resolveWindow(4 * HOUR).label).toBe('4_24h_secuencial');
    expect(resolveWindow(4 * HOUR - 1).label).toBe('1_4h_secuencial');
    expect(resolveWindow(1 * HOUR).label).toBe('1_4h_secuencial');
    expect(resolveWindow(1 * HOUR - 1).label).toBe('menos_1h_broadcast');
  });
});
