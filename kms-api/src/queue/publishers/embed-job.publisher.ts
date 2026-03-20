import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const amqplib = require('amqplib') as typeof import('amqplib');
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { AMQP_EMBED_QUEUE } from '../queue.constants';

/**
 * Message payload sent to the `kms.embed` RabbitMQ queue.
 * Consumed by `services/embed-worker` (Python/aio-pika).
 *
 * Field names are snake_case to match the Python `FileDiscoveredMessage` Pydantic model.
 *
 * The `scan_job_id` field is re-used as the file UUID when publishing from the
 * ingest endpoint — there is no separate scan job for direct Obsidian pushes.
 */
export interface EmbedJobMessage {
  /** UUID of the KmsFile record (used as file reference in Qdrant payloads) */
  scan_job_id: string;
  /** UUID of the KmsSource that owns the file */
  source_id: string;
  /** UUID of the owning user (multi-tenant isolation in the worker) */
  user_id: string;
  /** obsidian://note-path for Obsidian ingests, or actual disk path for scan-worker messages */
  file_path: string;
  /** Original filename including extension (e.g. My Note.md) */
  original_filename: string;
  /** MIME type of the file (e.g. text/markdown) */
  mime_type?: string;
  /** File size in bytes */
  file_size_bytes?: number;
  /** SHA-256 hex digest of the file content */
  checksum_sha256?: string;
  /** Source type identifier (e.g. 'obsidian', 'local', 'google_drive') */
  source_type: string;
  /** Arbitrary source-specific metadata forwarded to the embed-worker payload */
  source_metadata?: Record<string, unknown>;
  /** Full note content for direct ingestion — skips disk read in embed-worker */
  inline_content?: string;
}

/**
 * EmbedJobPublisher publishes embed job messages to the `kms.embed` RabbitMQ queue.
 *
 * Normally this queue is written to only by the scan-worker (Python), but the
 * Obsidian ingest endpoint bypasses the scan stage and writes directly here so
 * that inline content is embedded without ever touching disk.
 *
 * Uses durable queues with persistent delivery to survive broker restarts.
 */
@Injectable()
export class EmbedJobPublisher implements OnModuleInit, OnModuleDestroy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;

  constructor(
    @InjectPinoLogger(EmbedJobPublisher.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672/';
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      this.connection = await amqplib.connect(url) as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.channel = await this.connection.createChannel() as any;
      await this.channel.assertQueue(AMQP_EMBED_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'kms.dlx',
          'x-message-ttl': 3_600_000,
        },
      });
      this.logger.info({ queue: AMQP_EMBED_QUEUE }, 'EmbedJobPublisher connected to RabbitMQ');
    } catch (err) {
      this.logger.warn({ error: String(err) }, 'EmbedJobPublisher: RabbitMQ unavailable — embed jobs will fail');
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Ignore close errors during shutdown
    }
  }

  /**
   * Publishes an embed job message to the `kms.embed` RabbitMQ queue.
   *
   * @param message - Embed job payload matching the Python `FileDiscoveredMessage` schema.
   * @throws Error if the RabbitMQ channel is not available.
   */
  @Trace({ name: 'embed.publish' })
  async publishEmbedJob(message: EmbedJobMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('EmbedJobPublisher: RabbitMQ channel not available');
    }
    const body = Buffer.from(JSON.stringify(message));
    this.channel.sendToQueue(AMQP_EMBED_QUEUE, body, {
      persistent: true,
      contentType: 'application/json',
    });
    this.logger.info(
      { source_id: message.source_id, scan_job_id: message.scan_job_id, queue: AMQP_EMBED_QUEUE },
      'Embed job published to RabbitMQ',
    );
  }
}
