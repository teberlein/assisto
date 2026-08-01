// Abstracción de cola de jobs diferidos.
// Driver `redis` (BullMQ) en prod; driver `memory` (setTimeout, in-process) para
// dev sin Docker y para tests deterministas. Se elige con QUEUE_DRIVER.

export interface ScheduleOptions {
  /** id estable para poder cancelar / deduplicar el job */
  jobId?: string;
}

export interface JobQueue {
  schedule<T>(
    name: string,
    payload: T,
    delayMs: number,
    opts?: ScheduleOptions,
  ): Promise<string>;

  cancel(jobId: string): Promise<void>;

  register<T>(name: string, handler: (payload: T) => Promise<void>): void;

  /** sólo para tests con driver memory: corre los jobs vencidos ya mismo */
  drain?(): Promise<void>;
}

export const JOB_QUEUE = Symbol('JOB_QUEUE');

// Nombres de job usados en todo el repo. Centralizados para evitar typos
// entre quien encola y quien registra el handler.
export const JOB_NAMES = {
  /** motor de reasignación: notificar al próximo candidato (fase 3) */
  REASSIGNMENT_NOTIFY: 'reassignment.notify',
  /** recordatorio 48h antes (fase 5) */
  APPOINTMENT_REMINDER: 'appointment.reminder',
  /** auto-cancelación 24h antes si no confirmó (fase 5) */
  APPOINTMENT_AUTO_CANCEL: 'appointment.autoCancel',
} as const;
