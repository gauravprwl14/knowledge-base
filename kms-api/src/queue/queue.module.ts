import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  EMBED_QUEUE,
  SCAN_QUEUE,
  GRAPH_QUEUE,
  TRANSCRIPTION_QUEUE,
} from './queue.constants';

/**
 * QueueModule registers BullMQ queues used by the KMS API.
 *
 * Marked `@Global()` so that any feature module can inject a `Queue` token
 * without explicitly importing QueueModule.
 *
 * The Redis connection is derived from `ConfigService` at runtime using the
 * following environment variables:
 * - `REDIS_HOST`     — defaults to `localhost`
 * - `REDIS_PORT`     — defaults to `6379`
 * - `REDIS_PASSWORD` — optional
 * - `REDIS_DB`       — defaults to `0`
 *
 * Registered queues:
 * - `kms.embed`         (EMBED_QUEUE)
 * - `kms.scan`          (SCAN_QUEUE)
 * - `kms.graph`         (GRAPH_QUEUE)
 * - `kms.transcription` (TRANSCRIPTION_QUEUE)
 *
 * @example
 * ```typescript
 * // Inject a queue producer in any service
 * import { InjectQueue } from '@nestjs/bullmq';
 * import { Queue } from 'bullmq';
 * import { SCAN_QUEUE } from '@queue/queue.constants';
 *
 * @Injectable()
 * export class SourcesService {
 *   constructor(@InjectQueue(SCAN_QUEUE) private readonly scanQueue: Queue) {}
 * }
 * ```
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: config.get<number>('REDIS_PORT') ?? 6379,
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB') ?? 0,
        },
      }),
    }),

    // Register all queues so producers can be injected via @InjectQueue()
    BullModule.registerQueue(
      { name: EMBED_QUEUE },
      { name: SCAN_QUEUE },
      { name: GRAPH_QUEUE },
      { name: TRANSCRIPTION_QUEUE },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
