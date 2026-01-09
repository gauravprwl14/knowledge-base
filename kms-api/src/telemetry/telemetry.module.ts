import { Global, Module, DynamicModule, OnModuleDestroy } from '@nestjs/common';
import { shutdownOtelSdk } from './sdk/otel.sdk';

/**
 * TelemetryModule provides OpenTelemetry integration for the application.
 *
 * Note: The OTel SDK must be initialized before the NestJS application
 * starts, typically in main.ts before importing the AppModule.
 *
 * This module provides:
 * - Graceful shutdown of OTel on module destroy
 * - Export of telemetry decorators and utilities
 *
 * @example
 * ```typescript
 * // In main.ts (before NestFactory.create)
 * import { initOtelSdk } from './telemetry/sdk/otel.sdk';
 *
 * initOtelSdk({
 *   serviceName: 'kms-api',
 *   environment: process.env.NODE_ENV || 'development',
 *   otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
 *   enabled: process.env.OTEL_ENABLED !== 'false',
 * });
 *
 * // Then in AppModule
 * @Module({
 *   imports: [TelemetryModule],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class TelemetryModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await shutdownOtelSdk();
  }

  static forRoot(): DynamicModule {
    return {
      module: TelemetryModule,
      global: true,
    };
  }
}
