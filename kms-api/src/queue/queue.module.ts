import { Global, Module } from '@nestjs/common';
import { ScanJobPublisher } from './publishers/scan-job.publisher';

/**
 * QueueModule — RabbitMQ (AMQP) publisher infrastructure for kms-api.
 *
 * Marked `@Global()` so feature modules can inject `ScanJobPublisher` without
 * explicitly importing QueueModule.
 *
 * ## Single queue system: RabbitMQ only
 *
 * All async messaging uses RabbitMQ regardless of producer/consumer language.
 * NestJS publishes via `ScanJobPublisher` (amqplib).
 * Python workers consume via `aio-pika`.
 *
 * There is no BullMQ in this module. `@nestjs/schedule` handles all time-based
 * scheduling (cron, intervals) within NestJS. See ADR-0028.
 *
 * Queue topology:
 *   kms.scan          ← ScanJobPublisher (this module)   → scan-worker (Python)
 *   kms.embed         ← scan-worker (Python)             → embed-worker (Python)
 *   kms.dedup         ← scan-worker (Python)             → dedup-worker (Python)
 *   kms.graph         ← embed-worker (Python)            → graph-worker (Python)
 *   kms.transcription ← voice-app (Python)               → voice-app (Python)
 */
@Global()
@Module({
  providers: [ScanJobPublisher],
  exports: [ScanJobPublisher],
})
export class QueueModule {}
