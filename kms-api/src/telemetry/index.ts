/**
 * Telemetry Module Exports
 *
 * OpenTelemetry integration for distributed tracing and metrics.
 *
 * @example
 * ```typescript
 * import {
 *   initOtelSdk,
 *   shutdownOtelSdk,
 *   Trace,
 *   IncrementCounter,
 *   RecordDuration,
 *   withSpan,
 *   getTraceContext,
 * } from '@telemetry';
 *
 * // Initialize SDK in main.ts
 * initOtelSdk({ serviceName: 'kms-api', ... });
 *
 * // Use decorators in services
 * class MyService {
 *   @Trace()
 *   @RecordDuration()
 *   async processData() {
 *     // Automatically traced and timed
 *   }
 * }
 * ```
 */

export * from './sdk/otel.sdk';
export * from './decorators';
export * from './telemetry.module';
