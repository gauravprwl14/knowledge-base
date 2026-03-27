import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

/**
 * PrismaService — wraps PrismaClient for the search-api.
 *
 * Handles connection lifecycle via NestJS `OnModuleInit` / `OnModuleDestroy`
 * hooks.  The adapter uses `PrismaPg` (Prisma v7 driver adapter) so the
 * service connects to the same PostgreSQL instance as `kms-api` without
 * duplicating the schema.
 *
 * @example
 * ```typescript
 * \@Injectable()
 * export class KeywordService {
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   async search(q: string, userId: string) {
 *     return this.prisma.$queryRaw`SELECT ...`;
 *   }
 * }
 * ```
 */
@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'warn'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const isDevelopment =
      configService.get<string>('NODE_ENV') === 'development';
    const connectionString = configService.get<string>('DATABASE_URL')!;
    const logLevel = configService.get<string>('LOG_LEVEL', 'info');

    const adapter = new PrismaPg({ connectionString });

    super({
      adapter,
      log: isDevelopment
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ]
        : [
            { emit: 'event', level: 'error' },
            { emit: 'event', level: 'warn' },
          ],
      errorFormat: isDevelopment ? 'pretty' : 'minimal',
    });

    this.setupEventListeners(isDevelopment, logLevel);
  }

  /**
   * Registers Prisma event listeners for query/error/warn logging.
   *
   * @param isDevelopment - Enable verbose query logging.
   * @param logLevel - Active log level.
   */
  private setupEventListeners(
    isDevelopment: boolean,
    logLevel: string,
  ): void {
    this.$on('error', (event) => {
      this.logger.error(`Database error: ${event.message}`, {
        target: event.target,
        timestamp: event.timestamp,
      });
    });

    this.$on('warn', (event) => {
      this.logger.warn(`Database warning: ${event.message}`, {
        target: event.target,
        timestamp: event.timestamp,
      });
    });

    if (isDevelopment && logLevel === 'debug') {
      this.$on('query', (event) => {
        this.logger.debug(`Query: ${event.query}`, {
          params: event.params,
          duration: `${event.duration}ms`,
          target: event.target,
        });
      });
    }
  }

  /**
   * Connects to PostgreSQL when the NestJS module initialises.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.isConnected = true;
      this.logger.log('Successfully connected to database');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  /**
   * Disconnects from PostgreSQL when the NestJS module is destroyed.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.isConnected = false;
      this.logger.log('Disconnected from database');
    } catch (error) {
      this.logger.error('Error disconnecting from database', error);
      throw error;
    }
  }

  /**
   * Performs a lightweight `SELECT 1` to verify the database connection.
   *
   * @returns `true` when the database is reachable, `false` otherwise.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the current connection state.
   *
   * @returns `true` if connected, `false` otherwise.
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}
