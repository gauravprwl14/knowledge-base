/**
 * Logger Module Exports
 *
 * Provides structured logging with Pino integration.
 *
 * @example
 * ```typescript
 * import { LoggerModule, AppLogger, createLogger } from '@logger';
 *
 * // In a service
 * @Injectable()
 * export class MyService {
 *   private readonly logger: AppLogger;
 *
 *   constructor(logger: AppLogger) {
 *     this.logger = logger.child({ context: 'MyService' });
 *   }
 * }
 *
 * // Outside DI (bootstrap)
 * const logger = createLogger();
 * logger.info('Application starting');
 * ```
 */

export * from './logger.service';
export * from './logger.module';
