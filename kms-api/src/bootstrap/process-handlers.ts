import { INestApplication } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { shutdownOtelSdk, getTraceContext } from '../telemetry/sdk/otel.sdk';
import { globalLogger } from '../logger';

/**
 * Process handler configuration
 */
export interface ProcessHandlerConfig {
  /** Application instance */
  app: INestApplication;
  /** Service name for logging */
  serviceName: string;
  /** Graceful shutdown timeout in milliseconds */
  shutdownTimeout?: number;
}

let isShuttingDown = false;

/**
 * Sets up process signal handlers for graceful shutdown and error tracking
 *
 * Handles:
 * - SIGTERM: Graceful shutdown (Docker, Kubernetes)
 * - SIGINT: Ctrl+C termination
 * - uncaughtException: Unhandled exceptions
 * - unhandledRejection: Unhandled promise rejections
 *
 * @param config - Process handler configuration
 *
 * @example
 * ```typescript
 * // In main.ts
 * const app = await NestFactory.create(AppModule);
 * setupProcessHandlers({
 *   app,
 *   serviceName: 'kms-api',
 *   shutdownTimeout: 10000,
 * });
 * ```
 */
export function setupProcessHandlers(config: ProcessHandlerConfig): void {
  const { app, serviceName, shutdownTimeout = 10000 } = config;
  const logger = globalLogger.child({ context: 'ProcessHandler' });

  /**
   * Graceful shutdown handler
   */
  async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown...`, {
      signal,
      serviceName,
    });

    const tracer = trace.getTracer(serviceName);

    return tracer.startActiveSpan('process.shutdown', async (span) => {
      try {
        span.setAttribute('signal', signal);
        span.setAttribute('service.name', serviceName);

        // Set shutdown timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Shutdown timeout after ${shutdownTimeout}ms`));
          }, shutdownTimeout);
        });

        // Close NestJS application
        const closePromise = (async () => {
          logger.info('Closing NestJS application...');
          await app.close();
          logger.info('NestJS application closed');

          // Shutdown OpenTelemetry
          logger.info('Shutting down OpenTelemetry...');
          await shutdownOtelSdk();
          logger.info('OpenTelemetry shut down');
        })();

        await Promise.race([closePromise, timeoutPromise]);

        span.setStatus({ code: SpanStatusCode.OK });
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });

        if (error instanceof Error) {
          span.recordException(error);
        }

        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      } finally {
        span.end();
      }
    });
  }

  /**
   * Uncaught exception handler
   */
  function handleUncaughtException(error: Error): void {
    const traceContext = getTraceContext();
    const tracer = trace.getTracer(serviceName);

    tracer.startActiveSpan('process.uncaught_exception', (span) => {
      span.setAttribute('error.type', 'uncaught_exception');
      span.setAttribute('error.name', error.name);
      span.setAttribute('error.message', error.message);
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });

      logger.fatal('Uncaught exception', {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        ...traceContext,
      });

      span.end();

      // Exit with error code
      process.exit(1);
    });
  }

  /**
   * Unhandled rejection handler
   */
  function handleUnhandledRejection(reason: unknown, promise: Promise<unknown>): void {
    const traceContext = getTraceContext();
    const tracer = trace.getTracer(serviceName);

    tracer.startActiveSpan('process.unhandled_rejection', (span) => {
      span.setAttribute('error.type', 'unhandled_rejection');

      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      span.setAttribute('error.message', errorMessage);

      if (reason instanceof Error) {
        span.setAttribute('error.name', reason.name);
        span.recordException(reason);
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });

      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error
          ? {
              name: reason.name,
              message: reason.message,
              stack: reason.stack,
            }
          : reason,
        ...traceContext,
      });

      span.end();
    });

    // Note: We don't exit here to allow graceful handling
    // In production, you might want to exit: process.exit(1)
  }

  /**
   * Warning handler
   */
  function handleWarning(warning: Error): void {
    logger.warn('Node.js warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  }

  // Register signal handlers
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Register error handlers
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
  process.on('warning', handleWarning);

  logger.info('Process handlers registered', {
    signals: ['SIGTERM', 'SIGINT'],
    errorHandlers: ['uncaughtException', 'unhandledRejection', 'warning'],
    shutdownTimeout,
  });
}

/**
 * Creates a shutdown hook for additional cleanup
 *
 * @example
 * ```typescript
 * registerShutdownHook(async () => {
 *   await redis.quit();
 *   await database.disconnect();
 * });
 * ```
 */
const shutdownHooks: Array<() => Promise<void>> = [];

export function registerShutdownHook(hook: () => Promise<void>): void {
  shutdownHooks.push(hook);
}

export function getShutdownHooks(): Array<() => Promise<void>> {
  return shutdownHooks;
}
