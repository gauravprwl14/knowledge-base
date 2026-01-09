import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

/**
 * PrismaService extends PrismaClient and implements NestJS lifecycle hooks.
 * Handles database connection, disconnection, and query logging.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserRepository {
 *   constructor(private readonly prisma: PrismaService) {}
 *
 *   async findById(id: string) {
 *     return this.prisma.user.findUnique({ where: { id } });
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
    const logLevel = configService.get<string>('LOG_LEVEL', 'info');
    const isDevelopment = configService.get<string>('NODE_ENV') === 'development';

    super({
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

    // Setup event listeners
    this.setupEventListeners(isDevelopment, logLevel);
  }

  /**
   * Sets up Prisma event listeners for logging
   */
  private setupEventListeners(isDevelopment: boolean, logLevel: string): void {
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
   * Connects to the database when the module initializes
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
   * Disconnects from the database when the module is destroyed
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
   * Checks if the database connection is healthy
   * @returns Promise<boolean> - true if connected, false otherwise
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
   * Returns the connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Executes a callback within a transaction
   * @param callback - Function to execute within transaction
   * @param options - Transaction options
   * @returns Promise with the result of the callback
   *
   * @example
   * ```typescript
   * const result = await prisma.executeTransaction(async (tx) => {
   *   const user = await tx.user.create({ data: { email: 'test@example.com' } });
   *   const apiKey = await tx.apiKey.create({ data: { userId: user.id, ... } });
   *   return { user, apiKey };
   * });
   * ```
   */
  async executeTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<T> {
    return this.$transaction(callback, {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 10000,
      isolationLevel: options?.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  /**
   * Cleans up the database (for testing purposes only)
   * @warning This will delete all data in the database
   */
  async cleanDatabase(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production environment');
    }

    const tablenames = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations')
      .map((name) => `"public"."${name}"`)
      .join(', ');

    if (tables.length > 0) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  }
}
