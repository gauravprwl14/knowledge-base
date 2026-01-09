import { Global, Module, DynamicModule } from '@nestjs/common';
import { AppLogger, LoggerConfig } from './logger.service';

/**
 * LoggerModule provides the AppLogger service globally.
 *
 * @example
 * ```typescript
 * // Static registration (uses env defaults)
 * @Module({
 *   imports: [LoggerModule],
 * })
 * export class AppModule {}
 *
 * // Dynamic registration with custom config
 * @Module({
 *   imports: [
 *     LoggerModule.forRoot({
 *       level: 'debug',
 *       serviceName: 'my-service',
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {
  /**
   * Register the logger module with custom configuration
   */
  static forRoot(config?: Partial<LoggerConfig>): DynamicModule {
    return {
      module: LoggerModule,
      global: true,
      providers: [
        {
          provide: AppLogger,
          useValue: new AppLogger(config),
        },
      ],
      exports: [AppLogger],
    };
  }
}
