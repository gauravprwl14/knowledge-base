/**
 * RabbitMQ (AMQP) queue name constants.
 *
 * All async messaging in KMS — regardless of whether the producer is NestJS or
 * Python — goes through RabbitMQ. There is no second queue system.
 *
 * NestJS publishes via `ScanJobPublisher` (amqplib).
 * Python workers produce and consume via `aio-pika`.
 *
 * | Constant               | Queue name          | Producer             | Consumer         |
 * |------------------------|---------------------|----------------------|------------------|
 * | AMQP_SCAN_QUEUE        | `kms.scan`          | kms-api (NestJS)     | scan-worker      |
 * | AMQP_EMBED_QUEUE       | `kms.embed`         | scan-worker (Python) | embed-worker     |
 * | AMQP_DEDUP_QUEUE       | `kms.dedup`         | scan-worker (Python) | dedup-worker     |
 * | AMQP_GRAPH_QUEUE       | `kms.graph`         | embed-worker (Python)| graph-worker     |
 * | AMQP_TRANSCRIPTION_QUEUE | `kms.transcription` | voice-app (Python) | voice-app        |
 *
 * For time-based scheduling within NestJS, use `@nestjs/schedule` (`@Cron`, `@Interval`).
 * See ADR-0028.
 */

/** Queue consumed by `scan-worker` (Python/aio-pika). Published by kms-api. */
export const AMQP_SCAN_QUEUE = 'kms.scan';

/** Queue consumed by `embed-worker` (Python/aio-pika). Published by scan-worker. */
export const AMQP_EMBED_QUEUE = 'kms.embed';

/** Queue consumed by `dedup-worker` (Python/aio-pika). Published by scan-worker. */
export const AMQP_DEDUP_QUEUE = 'kms.dedup';

/** Queue consumed by `graph-worker` (Python/aio-pika). Published by embed-worker. */
export const AMQP_GRAPH_QUEUE = 'kms.graph';

/** Queue consumed by `voice-app` transcription microservice (Python/aio-pika). */
export const AMQP_TRANSCRIPTION_QUEUE = 'kms.transcription';
