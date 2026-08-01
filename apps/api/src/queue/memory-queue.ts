import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobQueue, ScheduleOptions } from './queue.types';

interface PendingJob {
  id: string;
  name: string;
  payload: unknown;
  runAt: number;
  timer: NodeJS.Timeout;
}

/**
 * Driver in-process. Reemplaza a BullMQ cuando no hay Redis (dev sin Docker) y
 * en tests, donde además permite ejecutar los jobs vencidos a demanda (`drain`).
 *
 * Limitaciones asumidas a propósito: no sobrevive reinicios y no coordina entre
 * instancias. Por eso prod usa QUEUE_DRIVER=redis.
 */
@Injectable()
export class MemoryQueue implements JobQueue, OnModuleDestroy {
  private readonly logger = new Logger(MemoryQueue.name);
  private readonly handlers = new Map<string, (payload: any) => Promise<void>>();
  private readonly jobs = new Map<string, PendingJob>();
  private seq = 0;

  register<T>(name: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(name, handler as (p: any) => Promise<void>);
  }

  async schedule<T>(
    name: string,
    payload: T,
    delayMs: number,
    opts?: ScheduleOptions,
  ): Promise<string> {
    const id = opts?.jobId ?? `${name}:${++this.seq}`;
    // jobId estable ⇒ reprogramar pisa el anterior, nunca duplica.
    await this.cancel(id);

    const delay = Math.max(0, delayMs);
    const timer = setTimeout(() => {
      this.jobs.delete(id);
      void this.run(name, payload);
    }, delay);
    // No mantener vivo el proceso sólo por un job pendiente.
    timer.unref?.();

    this.jobs.set(id, { id, name, payload, runAt: Date.now() + delay, timer });
    return id;
  }

  async cancel(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    clearTimeout(job.timer);
    this.jobs.delete(jobId);
  }

  /** Tests: corre ya mismo todo job cuyo runAt ya pasó (o todos si `all`). */
  async drain(all = false): Promise<void> {
    const now = Date.now();
    const due = [...this.jobs.values()]
      .filter((j) => all || j.runAt <= now)
      .sort((a, b) => a.runAt - b.runAt);
    for (const job of due) {
      clearTimeout(job.timer);
      this.jobs.delete(job.id);
      await this.run(job.name, job.payload);
    }
  }

  /** Tests: introspección de lo pendiente. */
  pending(): { id: string; name: string; runAt: number }[] {
    return [...this.jobs.values()].map(({ id, name, runAt }) => ({
      id,
      name,
      runAt,
    }));
  }

  private async run(name: string, payload: unknown) {
    const handler = this.handlers.get(name);
    if (!handler) {
      this.logger.warn(`No handler registered for job "${name}"`);
      return;
    }
    try {
      await handler(payload);
    } catch (err) {
      this.logger.error(`Job "${name}" failed: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    for (const job of this.jobs.values()) clearTimeout(job.timer);
    this.jobs.clear();
  }
}
