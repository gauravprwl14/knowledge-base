import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { getTraceContext } from '../../telemetry';

/**
 * Logging interceptor that logs request/response details
 *
 * Logs:
 * - Request method, URL, and headers
 * - Response status code and duration
 * - Correlation with trace IDs
 *
 * @example
 * ```typescript
 * // Global
 * app.useGlobalInterceptors(new LoggingInterceptor());
 *
 * // Controller-level
 * @UseInterceptors(LoggingInterceptor)
 * @Controller('users')
 * export class UsersController {}
 * ```
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const startTime = Date.now();
    const traceContext = getTraceContext();

    // Request logging
    const requestLog = {
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      contentLength: request.headers['content-length'],
      requestId: request.headers['x-request-id'],
      ...traceContext,
    };

    this.logger.debug(`Incoming request: ${request.method} ${request.url}`, requestLog);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          const responseLog = {
            ...requestLog,
            statusCode,
            duration: `${duration}ms`,
          };

          if (statusCode >= 400) {
            this.logger.warn(
              `Request completed: ${request.method} ${request.url} - ${statusCode}`,
              responseLog,
            );
          } else {
            this.logger.log(
              `Request completed: ${request.method} ${request.url} - ${statusCode}`,
              responseLog,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;

          this.logger.error(
            `Request failed: ${request.method} ${request.url}`,
            {
              ...requestLog,
              duration: `${duration}ms`,
              error: error.message,
            },
          );
        },
      }),
    );
  }
}
