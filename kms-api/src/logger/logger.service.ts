import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { trace, context, SpanContext } from '@opentelemetry/api';

/**
 * Log context interface for structured logging
 */
export interface LogContext {
  /** Module or class name */
  context?: string;
  /** OpenTelemetry trace ID */
  traceId?: string;
  /** OpenTelemetry span ID */
  spanId?: string;
  /** Request ID */
  requestId?: string;
  /** User ID */
  userId?: string;
  /** Additional metadata */
  [key: string]: any;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  level: string;
  serviceName: string;
  environment: string;
  prettyPrint?: boolean;
}

/**
 * Creates Pino logger configuration based on environment
 */
function createLoggerOptions(config: LoggerConfig): LoggerOptions {
  const baseOptions: LoggerOptions = {
    level: config.level,
    base: {
      service: config.serviceName,
      env: config.environment,
    },
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
      }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    messageKey: 'message',
    errorKey: 'error',
    nestedKey: 'payload',
  };

  // Pretty print for development
  if (config.prettyPrint) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
          messageFormat: '{context} - {message}',
        },
      },
    };
  }

  return baseOptions;
}

/**
 * AppLogger - Application logger service using Pino
 *
 * Features:
 * - Structured JSON logging
 * - OpenTelemetry trace context injection
 * - Child logger support for contextual logging
 * - Pretty printing in development
 * - NestJS LoggerService compatible
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   private readonly logger: AppLogger;
 *
 *   constructor(logger: AppLogger) {
 *     this.logger = logger.child({ context: 'MyService' });
 *   }
 *
 *   someMethod() {
 *     this.logger.info('Processing request', { userId: '123' });
 *   }
 * }
 * ```
 */
@Injectable()
export class AppLogger implements NestLoggerService {
  private readonly logger: PinoLogger;
  private contextName?: string;

  constructor(config?: Partial<LoggerConfig>) {
    const defaultConfig: LoggerConfig = {
      level: process.env.LOG_LEVEL || 'info',
      serviceName: process.env.APP_NAME || 'kms-api',
      environment: process.env.NODE_ENV || 'development',
      prettyPrint: process.env.NODE_ENV === 'development',
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.logger = pino(createLoggerOptions(finalConfig));
  }

  /**
   * Creates a child logger with additional context
   */
  child(bindings: LogContext): AppLogger {
    const childLogger = new AppLogger();
    (childLogger as any).logger = this.logger.child(bindings);
    childLogger.contextName = bindings.context;
    return childLogger;
  }

  /**
   * Sets the context name for this logger
   */
  setContext(contextName: string): void {
    this.contextName = contextName;
  }

  /**
   * Gets current trace context from OpenTelemetry
   */
  private getTraceContext(): { traceId?: string; spanId?: string } {
    const span = trace.getSpan(context.active());
    if (!span) return {};

    const spanContext: SpanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }

  /**
   * Merges log context with trace context
   */
  private mergeContext(ctx?: LogContext): LogContext {
    const traceContext = this.getTraceContext();
    return {
      context: this.contextName,
      ...traceContext,
      ...ctx,
    };
  }

  /**
   * Formats message and extracts context
   */
  private formatMessage(
    message: any,
    ...optionalParams: any[]
  ): { msg: string; ctx: LogContext } {
    let msg = typeof message === 'string' ? message : JSON.stringify(message);
    let ctx: LogContext = {};

    // Check if last param is context object
    if (optionalParams.length > 0) {
      const lastParam = optionalParams[optionalParams.length - 1];
      if (typeof lastParam === 'object' && lastParam !== null && !(lastParam instanceof Error)) {
        ctx = lastParam;
        optionalParams = optionalParams.slice(0, -1);
      }
    }

    // Format remaining params into message
    if (optionalParams.length > 0) {
      optionalParams.forEach((param, index) => {
        if (param instanceof Error) {
          ctx.error = {
            name: param.name,
            message: param.message,
            stack: param.stack,
          };
        } else {
          msg = msg.replace(`%s`, String(param));
          msg = msg.replace(`%d`, String(param));
          msg = msg.replace(`%j`, JSON.stringify(param));
        }
      });
    }

    return { msg, ctx: this.mergeContext(ctx) };
  }

  /**
   * Log at trace level
   */
  trace(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.trace(ctx, msg);
  }

  /**
   * Log at debug level
   */
  debug(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.debug(ctx, msg);
  }

  /**
   * Log at info level
   */
  log(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.info(ctx, msg);
  }

  /**
   * Log at info level (alias for log)
   */
  info(message: any, ...optionalParams: any[]): void {
    this.log(message, ...optionalParams);
  }

  /**
   * Log at warn level
   */
  warn(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.warn(ctx, msg);
  }

  /**
   * Log at error level
   */
  error(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.error(ctx, msg);
  }

  /**
   * Log at fatal level
   */
  fatal(message: any, ...optionalParams: any[]): void {
    const { msg, ctx } = this.formatMessage(message, ...optionalParams);
    this.logger.fatal(ctx, msg);
  }

  /**
   * Log with verbose level (alias for debug)
   */
  verbose(message: any, ...optionalParams: any[]): void {
    this.debug(message, ...optionalParams);
  }

  /**
   * Gets the underlying Pino logger instance
   */
  getPinoInstance(): PinoLogger {
    return this.logger;
  }

  /**
   * Flushes any buffered logs
   */
  flush(): void {
    this.logger.flush();
  }
}

/**
 * Creates a standalone logger instance for use outside NestJS DI
 */
export function createLogger(config?: Partial<LoggerConfig>): AppLogger {
  return new AppLogger(config);
}

/**
 * Global logger instance for use in bootstrap and outside DI
 */
export const globalLogger = createLogger();
