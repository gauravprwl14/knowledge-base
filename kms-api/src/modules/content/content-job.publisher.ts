import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const amqplib = require('amqplib') as typeof import('amqplib');
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/** Name of the RabbitMQ queue for content generation jobs. */
const CONTENT_QUEUE = process.env.CONTENT_QUEUE ?? 'kms.content';

/**
 * Message payload published to the `kms.content` RabbitMQ queue.
 *
 * Consumed by the content-worker (Python/aio-pika). Field names are
 * snake_case to match the Python pydantic model on the consumer side.
 */
export interface ContentJobMessage {
  /** UUID of the ContentJob record. */
  job_id: string;
  /** UUID of the owning user (multi-tenant isolation in the worker). */
  user_id: string;
  /** Source type string matching the ContentSourceType enum. */
  source_type: string;
  /** Source URL (YouTube, web URL). Present for YOUTUBE and URL source types. */
  source_url?: string;
  /**
   * UUID of the KMS file to use as source.
   * Present for KMS_FILE, DOCUMENT, and VIDEO source types.
   */
  source_file_id?: string;
  /**
   * Snapshot of the user's content configuration at job creation time.
   * Passed as-is from `content_jobs.config_snapshot` — never re-queried.
   */
  config_snapshot: Record<string, unknown>;
  /**
   * User's creator voice profile text, or an empty string if not configured.
   * The worker applies this to all platform writer prompts.
   */
  voice_profile?: string;
  /**
   * Which processing step to run. 'full' = run all enabled steps end-to-end.
   * Platform-specific values (e.g. 'linkedin', 'blog') re-run a single writer.
   */
  step: 'full' | string;
  /**
   * When step is a single-platform re-run, this field names the target platform
   * so the worker can route to the correct writer.
   */
  platform?: string;
  /**
   * Variation slot index for single-platform variation requests.
   * The worker creates a new ContentPiece at this index.
   */
  variation_index?: number;
}

/**
 * ContentJobPublisher — publishes content generation job messages to the
 * `kms.content` RabbitMQ queue.
 *
 * Follows the same connection lifecycle as `ScanJobPublisher`:
 *   - Connects on `onModuleInit`; logs a warning (not a crash) on failure.
 *   - Registers error/close handlers to null the channel so the lazy
 *     reconnect path in `publishContentJob` can recover.
 *   - Attempts a single reconnect when the channel is null at publish time.
 *
 * On publish failure throws `AppError(KBCNT0012)` so the caller can mark
 * the job FAILED and surface a meaningful error to the user.
 */
@Injectable()
export class ContentJobPublisher implements OnModuleInit, OnModuleDestroy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;

  constructor(
    @InjectPinoLogger(ContentJobPublisher.name)
    private readonly logger: PinoLogger,
  ) {}

  /** @inheritdoc */
  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672/';
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      this.connection = await amqplib.connect(url) as any;

      // Guard against unhandled 'error' / 'close' events on the TCP connection.
      // Without these handlers Node.js escalates to an uncaught exception and
      // kills the process. See ScanJobPublisher for the same pattern.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.connection.on('error', (err: Error) => {
        this.logger.warn(
          { error: String(err) },
          'ContentJobPublisher: RabbitMQ connection error — will reconnect on next publish',
        );
        this.channel = null;
        this.connection = null;
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.connection.on('close', () => {
        this.logger.warn(
          'ContentJobPublisher: RabbitMQ connection closed — will reconnect on next publish',
        );
        this.channel = null;
        this.connection = null;
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.channel = await this.connection.createChannel() as any;

      // Assert the queue with the same DLX topology as other kms.* queues
      await this.channel.assertQueue(CONTENT_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'kms.dlx',
          'x-message-ttl': 3_600_000,
        },
      });

      this.logger.info({ queue: CONTENT_QUEUE }, 'ContentJobPublisher connected to RabbitMQ');
    } catch (err) {
      // Log as warning, not error — the module starts up without RabbitMQ;
      // the reconnect path handles recovery when the broker becomes available.
      this.logger.warn(
        { error: String(err) },
        'ContentJobPublisher: RabbitMQ unavailable at startup — content jobs will fail until broker recovers',
      );
    }
  }

  /** @inheritdoc */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // Ignore close errors during graceful shutdown
    }
  }

  /**
   * Attempts to (re-)establish the AMQP connection and channel.
   *
   * Called lazily when `this.channel` is null so that a startup failure
   * (broker not yet healthy) does not permanently block the first publish.
   */
  private async reconnect(): Promise<void> {
    // Tear down any stale handles before retrying
    try { await this.channel?.close(); } catch { /* ignore */ }
    try { await this.connection?.close(); } catch { /* ignore */ }
    this.channel = null;
    this.connection = null;
    await this.onModuleInit();
  }

  /**
   * Publishes a content generation job message to the `kms.content` queue.
   *
   * If the channel is null (startup failure or broker restart), a single
   * reconnect attempt is made. If the channel remains unavailable after the
   * reconnect, this method throws `AppError(KBCNT0012)` so the caller can
   * mark the job as FAILED and surface a user-facing error.
   *
   * @param message - Content job payload to publish.
   * @throws {AppError} KBCNT0012 when the RabbitMQ channel is unavailable after reconnect.
   */
  @Trace({ name: 'content.publish' })
  async publishContentJob(message: ContentJobMessage): Promise<void> {
    // Lazy reconnect — handles both startup failures and mid-session broker restarts
    if (!this.channel) {
      this.logger.warn(
        { job_id: message.job_id },
        'ContentJobPublisher: channel null — attempting reconnect',
      );
      await this.reconnect();
    }

    // If the channel is still null after reconnect, give up and surface a retryable error
    if (!this.channel) {
      throw new AppError({
        code: ERROR_CODES.CNT.QUEUE_PUBLISH_FAILED.code,
        message: 'ContentJobPublisher: RabbitMQ channel not available after reconnect',
      });
    }

    const body = Buffer.from(JSON.stringify(message));
    // sendToQueue is synchronous in amqplib; it returns false if the channel
    // buffer is full but does NOT throw. We treat a false return as success —
    // the message is still delivered once the buffer drains. This matches the
    // pattern used by ScanJobPublisher and EmbedJobPublisher.
    this.channel.sendToQueue(CONTENT_QUEUE, body, {
      persistent: true,
      contentType: 'application/json',
    });

    this.logger.info(
      { job_id: message.job_id, user_id: message.user_id, step: message.step, queue: CONTENT_QUEUE },
      'Content job published to RabbitMQ',
    );
  }
}
