import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  APPOINTMENT_EVENTS,
  AppointmentCancelledEvent,
  AppointmentCreatedEvent,
  AppointmentReassignedEvent,
  AppointmentReleasedEvent,
} from '../../events/appointment.events';
import { GoogleCalendarService } from './google-calendar.service';

/**
 * Espejo del turno en Google Calendar (sec 8.2).
 *
 * **Regla de oro: la fuente de verdad es nuestra DB.** Un fallo de Google —red,
 * token revocado, cuota— nunca puede romper la operación local, así que todo
 * pasa por `safe()`: se loguea y se sigue. Peor caso, el calendario queda
 * desincronizado y se arregla en la próxima operación sobre ese turno.
 */
@Injectable()
export class CalendarSyncListener {
  private readonly logger = new Logger(CalendarSyncListener.name);

  constructor(private readonly google: GoogleCalendarService) {}

  @OnEvent(APPOINTMENT_EVENTS.CREATED, { async: true })
  async onCreated(event: AppointmentCreatedEvent): Promise<void> {
    await this.safe('crear', event.appointmentId, () =>
      this.google.upsertEvent(event.appointmentId),
    );
  }

  /**
   * El cupo se liberó y entró al motor: el profesional no tiene que verlo
   * ocupado en su calendario mientras se reasigna (sec 6.1).
   */
  @OnEvent(APPOINTMENT_EVENTS.RELEASED, { async: true })
  async onReleased(event: AppointmentReleasedEvent): Promise<void> {
    await this.safe('liberar', event.appointmentId, () =>
      this.google.deleteEvent(event.appointmentId),
    );
  }

  /** Cambió el paciente: `upsertEvent` reescribe título, descripción e invitado. */
  @OnEvent(APPOINTMENT_EVENTS.REASSIGNED, { async: true })
  async onReassigned(event: AppointmentReassignedEvent): Promise<void> {
    await this.safe('reasignar', event.appointmentId, () =>
      this.google.upsertEvent(event.appointmentId),
    );
  }

  @OnEvent(APPOINTMENT_EVENTS.CANCELLED, { async: true })
  async onCancelled(event: AppointmentCancelledEvent): Promise<void> {
    await this.safe('cancelar', event.appointmentId, () =>
      this.google.deleteEvent(event.appointmentId),
    );
  }

  private async safe(
    action: string,
    appointmentId: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Google Calendar falló al ${action} el turno ${appointmentId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
