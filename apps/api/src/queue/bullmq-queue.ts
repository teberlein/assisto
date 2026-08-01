import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, JobsOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { JobQueue, ScheduleOptions } from './queue.types';

const QUEUE_NAME = 'asissto';

/**
 * Driver de producción. Un único stream BullMQ con jobs nombrados; el worker
 * despacha al handler registrado. Sobrevive reinicios y coordina N instancias.
 */
@Injectable()
export class BullmqQueue implements JobQueue, OnModuleDestroy {
  private readonly logger = new Logger(BullmqQueue.name);
  private readonly handlers = new Map<string, (payload: any) => Promise<void>>();
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(config: ConfigService) {
    const connection: RedisOptions = {
      host: config.get<string>('REDIS_HOST') ?? 'localhost',
      port: Number(config.get<string>('REDIS_PORT') ?? 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    };

    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          this.logger.warn(`No handler registered for job "${job.name}"`);
          return;
        }
        await handler(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (job, err) =>
      this.logger.error(`Job "${job?.name}" failed: ${err.message}`),
    );
  }

  register<T>(name: string, handler: (payload: T) => Promise<void>): void {
    this.handlers.set(name, handler as (p: any) => Promise<void>);
  }

  async schedule<T>(
    name: string,
    payload: T,
    delayMs: number,
    opts?: ScheduleOptions,
  ): Promise<string> {
    const jobOptions: JobsOptions = {
      delay: Math.max(0, delayMs),
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    };
    if (opts?.jobId) {
      // Reprogramar con el mismo id: borrar el anterior para que el delay nuevo mande.
      jobOptions.jobId = opts.jobId;
      await this.cancel(opts.jobId);
    }
    const job = await this.queue.add(name, payload, jobOptions);
    return String(job.id);
  }

  async cancel(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) await job.remove().catch(() => undefined);
  }

  async onModuleDestroy() {
    await this.worker.close().catch(() => undefined);
    await this.queue.close().catch(() => undefined);
  }
}
