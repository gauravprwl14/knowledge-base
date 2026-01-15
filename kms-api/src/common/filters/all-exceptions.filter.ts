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
import { ERROR_CODES, ErrorCode } from '../../errors/error-codes';
import { handlePrismaError, isPrismaError } from '../../errors/handlers/prisma-error.handler';
import { getTraceContext, recordSpanException } from '../../telemetry';
import { ErrorResponse } from '../dto/response.dto';

/**
 * Global exception filter that catches ALL exceptions
 *
 * This filter handles:
 * - HttpExceptions (NestJS built-in)
 * - AppError (custom application errors)
 * - Prisma errors (database errors)
 * - Unknown errors (unexpected exceptions)
 *
 * @example
 * ```typescript
 * // In main.ts
 * app.useGlobalFilters(new AllExceptionsFilter());
 * ```
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceContext = getTraceContext();
    const requestId = (request.headers['x-request-id'] as string) || undefined;

    // Convert exception to AppError if needed
    const appError = this.normalizeException(exception);

    // Get response body from AppError
    const errorResponse = appError.toResponse(!this.isProduction);

    // Ensure standard fields are present
    const responseBody = {
      ...errorResponse,
      path: request.url,
      method: request.method,
    } as ErrorResponse & { path: string; method: string };

    // Add trace context
    if (traceContext.traceId && responseBody.error) {
      responseBody.error.traceId = traceContext.traceId;
    }
    if (requestId && responseBody.error) {
      responseBody.error.requestId = requestId;
    }

    // Log error
    this.logException(exception, appError, request);

    // Record exception in OpenTelemetry
    if (exception instanceof Error) {
      recordSpanException(exception);
    }

    // Send response
    response.status(appError.statusCode).json(responseBody);
  }

  /**
   * Converts any exception to an AppError
   */
  private normalizeException(exception: unknown): AppError {
    // Already an AppError
    if (AppError.isAppError(exception)) {
      return exception;
    }

    // HttpException from NestJS
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;

      return new AppError({
        code: this.getCodeFromStatus(exception.getStatus()),
        message: Array.isArray(message) ? message.join(', ') : message,
        statusCode: exception.getStatus(),
        cause: exception,
        isOperational: true,
      });
    }

    // Prisma errors
    if (isPrismaError(exception)) {
      return handlePrismaError(exception);
    }

    // Generic Error
    if (exception instanceof Error) {
      // Don't expose internal error messages in production
      const message = this.isProduction
        ? 'An internal server error occurred'
        : exception.message;

      return new AppError({
        code: ERROR_CODES.SRV.INTERNAL_ERROR.code,
        message,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        cause: exception,
        isOperational: false,
      });
    }

    // Unknown error type
    return new AppError({
      code: ERROR_CODES.GEN.UNKNOWN.code,
      message: 'An unknown error occurred',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      isOperational: false,
    });
  }

  /**
   * Maps HTTP status to error code
   */
  private getCodeFromStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VAL.INVALID_INPUT.code;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.AUT.UNAUTHENTICATED.code;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.AUZ.FORBIDDEN.code;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.DAT.NOT_FOUND.code;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.DAT.CONFLICT.code;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.GEN.RATE_LIMITED.code;
      default:
        return status >= 500 ? ERROR_CODES.SRV.INTERNAL_ERROR.code : ERROR_CODES.GEN.UNKNOWN.code;
    }
  }

  /**
   * Logs exception with appropriate level
   */
  private logException(exception: unknown, appError: AppError, request: Request): void {
    const logContext = {
      code: appError.code,
      statusCode: appError.statusCode,
      path: request.url,
      method: request.method,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      isOperational: appError.isOperational,
      context: appError.context,
    };

    // Programming errors (non-operational) are always logged as errors with stack
    if (!appError.isOperational) {
      this.logger.error(
        `Unhandled exception: ${appError.errorMessage}`,
        exception instanceof Error ? exception.stack : undefined,
        logContext,
      );
      return;
    }

    // Operational errors logged based on status
    if (appError.statusCode >= 500) {
      this.logger.error(`Server error: ${appError.errorMessage}`, logContext);
    } else if (appError.statusCode >= 400) {
      this.logger.warn(`Client error: ${appError.errorMessage}`, logContext);
    } else {
      this.logger.debug(`Error response: ${appError.errorMessage}`, logContext);
    }
  }
}
