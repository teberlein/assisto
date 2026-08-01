import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JOB_QUEUE, JobQueue } from './queue.types';
import { MemoryQueue } from './memory-queue';
import { BullmqQueue } from './bullmq-queue';

@Global()
@Module({
  providers: [
    {
      provide: JOB_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JobQueue =>
        config.get<string>('QUEUE_DRIVER') === 'redis'
          ? new BullmqQueue(config)
          : new MemoryQueue(),
    },
  ],
  exports: [JOB_QUEUE],
})
export class QueueModule {}
