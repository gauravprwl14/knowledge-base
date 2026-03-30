import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const amqplib = require('amqplib') as typeof import('amqplib');
import { Trace } from '../../telemetry/decorators/trace.decorator';

const SCAN_QUEUE = 'kms.scan';

/**
 * Message payload sent to the `kms.scan` RabbitMQ queue.
 * Consumed by `services/scan-worker` (Python/aio-pika).
 *
 * Field names are snake_case to match the Python ScanJobMessage pydantic model.
 */
export interface ScanJobMessage {
  /** UUID of the KmsScanJob record created before publishing */
  scan_job_id: string;
  /** UUID of the source to scan */
  source_id: string;
  /** Source type: 'local' | 'google_drive' | 'obsidian' */
  source_type: string;
  /** UUID of the owning user (multi-tenant isolation in the worker) */
  user_id: string;
  /** FULL re-indexes everything; INCREMENTAL only processes changes since last scan */
  scan_type: 'FULL' | 'INCREMENTAL';
  /** Source config JSON (path, driveId, etc.) */
  config: Record<string, unknown>;
}

/**
 * ScanJobPublisher publishes scan job messages to the `kms.scan` RabbitMQ queue.
 *
 * Connects to RabbitMQ via AMQP using the RABBITMQ_URL environment variable.
 * Uses durable queues with persistent delivery to survive broker restarts.
 */
@Injectable()
export class ScanJobPublisher implements OnModuleInit, OnModuleDestroy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private connection: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;

  constructor(
    @InjectPinoLogger(ScanJobPublisher.name)
    private readonly logger: PinoLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@rabbitmq:5672/';
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      this.connection = await amqplib.connect(url) as any;
      // Guard against unhandled 'error' / 'close' events on the TCP connection.
      // Without these handlers Node.js escalates to an uncaught exception and
      // kills the process (root cause of the 2026-03-28 production outage).
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.connection.on('error', (err: Error) => {
        this.logger.warn({ error: String(err) }, 'ScanJobPublisher: RabbitMQ connection error — will reconnect on next publish');
        this.channel = null;
        this.connection = null;
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.connection.on('close', () => {
        this.logger.warn('ScanJobPublisher: RabbitMQ connection closed — will reconnect on next publish');
        this.channel = null;
        this.connection = null;
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.channel = await this.connection.createChannel() as any;
      await this.channel.assertQueue(SCAN_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'kms.dlx',
          'x-message-ttl': 3_600_000,
        },
      });
      this.logger.info({ queue: SCAN_QUEUE }, 'ScanJobPublisher connected to RabbitMQ');
    } catch (err) {
      this.logger.warn({ error: String(err) }, 'ScanJobPublisher: RabbitMQ unavailable — scan jobs will fail');
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
   * Attempts to (re-)connect to RabbitMQ. Called lazily when channel is null
   * so that a startup failure (e.g. RabbitMQ not yet healthy) does not prevent
   * the first scan trigger from working once the broker recovers.
   */
  private async reconnect(): Promise<void> {
    // Close stale handles before retrying
    try { await this.channel?.close(); } catch { /* ignore */ }
    try { await this.connection?.close(); } catch { /* ignore */ }
    this.channel = null;
    this.connection = null;
    await this.onModuleInit();
  }

  /**
   * Publishes a scan job message to the `kms.scan` RabbitMQ queue.
   *
   * If the channel is not available (startup failure or broker restart), a
   * single reconnect attempt is made before throwing so that transient
   * unavailability does not permanently block scan triggers.
   *
   * @param message - Scan job payload
   */
  @Trace({ name: 'scan.publish' })
  async publishScanJob(message: ScanJobMessage): Promise<void> {
    if (!this.channel) {
      this.logger.warn({ scan_job_id: message.scan_job_id }, 'ScanJobPublisher: channel null — attempting reconnect');
      await this.reconnect();
    }
    if (!this.channel) {
      throw new Error('ScanJobPublisher: RabbitMQ channel not available');
    }
    const body = Buffer.from(JSON.stringify(message));
    this.channel.sendToQueue(SCAN_QUEUE, body, {
      persistent: true,
      contentType: 'application/json',
    });
    this.logger.info(
      { source_id: message.source_id, scan_job_id: message.scan_job_id, queue: SCAN_QUEUE },
      'Scan job published to RabbitMQ',
    );
  }
}
