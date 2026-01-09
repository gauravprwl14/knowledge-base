import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { getTraceContext, recordSpanException } from '../../telemetry';
import { ErrorResponse } from '../dto/response.dto';

/**
 * Global HTTP exception filter
 *
 * Catches all HTTP exceptions and transforms them into a standard error response format.
 * Integrates with OpenTelemetry for error tracking.
 *
 * @example
 * ```typescript
 * // In main.ts
 * app.useGlobalFilters(new HttpExceptionFilter());
 *
 * // Or in module
 * @Module({
 *   providers: [
 *     { provide: APP_FILTER, useClass: HttpExceptionFilter },
 *   ],
 * })
 * ```
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception.getStatus();
    const traceContext = getTraceContext();

    // Get request ID from headers
    const requestId = (request.headers['x-request-id'] as string) || undefined;

    let errorResponse: ErrorResponse;

    if (AppError.isAppError(exception)) {
      // Handle AppError
      const appErrorResponse = exception.getResponse() as any;
      errorResponse = {
        ...appErrorResponse,
        path: request.url,
        method: request.method,
      };

      // Add trace context if available
      if (traceContext.traceId) {
        errorResponse.error.traceId = traceContext.traceId;
      }
      if (requestId) {
        errorResponse.error.requestId = requestId;
      }
    } else {
      // Handle generic HttpException
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;

      const code = this.getErrorCodeFromStatus(status);

      errorResponse = {
        success: false,
        error: {
          code,
          message: Array.isArray(message) ? message.join(', ') : message,
          ...(requestId && { requestId }),
          ...(traceContext.traceId && { traceId: traceContext.traceId }),
        },
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
      };
    }

    // Log error
    this.logError(exception, errorResponse, request);

    // Record exception in OpenTelemetry span
    recordSpanException(exception, errorResponse.error.message);

    // Send response
    response.status(status).json(errorResponse);
  }

  /**
   * Maps HTTP status to error code
   */
  private getErrorCodeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VAL.INVALID_INPUT;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.AUT.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.AUZ.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.DAT.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.DAT.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ERROR_CODES.VAL.INVALID_INPUT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.GEN.RATE_LIMITED;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return ERROR_CODES.SRV.INTERNAL_ERROR;
      case HttpStatus.BAD_GATEWAY:
        return ERROR_CODES.EXT.SERVICE_ERROR;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.GEN.SERVICE_UNAVAILABLE;
      case HttpStatus.GATEWAY_TIMEOUT:
        return ERROR_CODES.GEN.TIMEOUT;
      default:
        return ERROR_CODES.GEN.UNKNOWN;
    }
  }

  /**
   * Logs the error with appropriate level
   */
  private logError(exception: HttpException, errorResponse: ErrorResponse, request: Request): void {
    const status = exception.getStatus();
    const logData = {
      statusCode: status,
      code: errorResponse.error.code,
      path: errorResponse.path,
      method: errorResponse.method,
      requestId: errorResponse.error.requestId,
      traceId: errorResponse.error.traceId,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    };

    // Log based on status code severity
    if (status >= 500) {
      this.logger.error(
        `[${status}] ${errorResponse.error.message}`,
        exception.stack,
        logData,
      );
    } else if (status >= 400) {
      this.logger.warn(`[${status}] ${errorResponse.error.message}`, logData);
    } else {
      this.logger.debug(`[${status}] ${errorResponse.error.message}`, logData);
    }
  }
}
