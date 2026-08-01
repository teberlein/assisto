import {
  buildAutoCancelMessage,
  buildReminderMessage,
  confirmButtonId,
  formatMoment,
} from './reminder-message';

const TZ = 'America/Argentina/Buenos_Aires';

describe('reminder-message', () => {
  it('formatea el momento en la TZ de la cuenta, no en UTC', () => {
    // 2025-08-14T18:30Z = jueves 14/8 15:30 en Buenos Aires (UTC-3)
    const at = new Date('2025-08-14T18:30:00.000Z');
    expect(formatMoment(at, TZ)).toBe('jueves 14/8 a las 15:30');
    expect(formatMoment(at, 'UTC')).toBe('jueves 14/8 a las 18:30');
  });

  it('arma el recordatorio con la hora deadline escrita literalmente (sec 5.4)', () => {
    const startAt = new Date('2025-08-14T18:30:00.000Z');
    const deadlineAt = new Date(startAt.getTime() - 24 * 3600_000);

    const body = buildReminderMessage({
      patientFullName: 'Juan Paciente',
      professionalName: 'Dra. Ana',
      startAt,
      deadlineAt,
      timezone: TZ,
    });

    expect(body).toBe(
      'Hola Juan, te recordamos tu turno con Dra. Ana el jueves 14/8 a las 15:30. ' +
        'Confirmá tu asistencia; si no confirmás antes del miércoles 13/8 a las 15:30, ' +
        'el turno se cancela automáticamente.',
    );
  });

  it('el mensaje de auto-cancelación nombra el turno caído', () => {
    const body = buildAutoCancelMessage({
      patientFullName: 'Lucía Gómez',
      professionalName: 'Dr. Bruno',
      startAt: new Date('2025-08-14T18:30:00.000Z'),
      timezone: TZ,
    });
    expect(body).toContain('Hola Lucía');
    expect(body).toContain('Dr. Bruno');
    expect(body).toContain('jueves 14/8 a las 15:30');
  });

  it('el id del botón de confirmar lleva el appointmentId', () => {
    expect(confirmButtonId('appt-1')).toBe('confirm:appt-1');
  });
});
