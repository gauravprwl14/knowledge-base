import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AppError, ERROR_CODES } from "../../errors/app-error";

/**
 * Global exception filter for the search-api.
 *
 * Handles:
 * - {@link AppError} (structured application errors)
 * - NestJS {@link HttpException}
 * - Unknown / unhandled errors
 *
 * All errors are serialised into a consistent `{ success, error, timestamp }` envelope.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === "production";
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const appError = this.normalizeException(exception);
    const responseBody = {
      ...appError.toResponse(!this.isProduction),
      path: request.url,
      method: request.method,
    };

    this.logException(exception, appError, request);
    response.status(appError.statusCode).send(responseBody);
  }

  private normalizeException(exception: unknown): AppError {
    if (AppError.isAppError(exception)) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === "string"
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;

      return new AppError({
        code: ERROR_CODES.GEN.INTERNAL_ERROR.code,
        message: Array.isArray(message) ? message.join(", ") : message,
        statusCode: exception.getStatus(),
        cause: exception,
        isOperational: true,
      });
    }

    if (exception instanceof Error) {
      const message = this.isProduction
        ? "An internal server error occurred"
        : exception.message;

      return new AppError({
        code: ERROR_CODES.GEN.INTERNAL_ERROR.code,
        message,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        cause: exception,
        isOperational: false,
      });
    }

    return new AppError({
      code: ERROR_CODES.GEN.INTERNAL_ERROR.code,
      message: "An unknown error occurred",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      isOperational: false,
    });
  }

  private logException(
    exception: unknown,
    appError: AppError,
    request: FastifyRequest,
  ): void {
    const ctx = {
      code: appError.code,
      statusCode: appError.statusCode,
      path: request.url,
      method: request.method,
      isOperational: appError.isOperational,
    };

    if (!appError.isOperational) {
      this.logger.error(
        `Unhandled exception: ${appError.errorMessage}`,
        exception instanceof Error ? exception.stack : undefined,
        ctx,
      );
      return;
    }

    if (appError.statusCode >= 500) {
      this.logger.error(`Server error: ${appError.errorMessage}`, ctx);
    } else {
      this.logger.warn(`Client error: ${appError.errorMessage}`, ctx);
    }
  }
}
