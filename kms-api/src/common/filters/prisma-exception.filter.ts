import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { handlePrismaError, isPrismaError } from '../../errors/handlers/prisma-error.handler';
import { AppLogger } from '../../logger/logger.service';

/**
 * PrismaExceptionFilter — catches Prisma client errors before the global
 * AllExceptionsFilter handles them.
 *
 * Mapped Prisma error codes:
 * - P2002 → 409 Conflict (unique constraint violation)
 * - P2025 → 404 Not Found (record not found)
 * - P2003 → 400 Bad Request (foreign-key constraint failure)
 *
 * All other Prisma errors are also intercepted and converted to typed
 * AppError instances so that downstream filters receive a consistent
 * error object.
 *
 * @example
 * ```typescript
 * // In app.module.ts providers array — register BEFORE AllExceptionsFilter
 * { provide: APP_FILTER, useClass: PrismaExceptionFilter },
 * { provide: APP_FILTER, useClass: AllExceptionsFilter },
 * ```
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger: AppLogger;

  constructor(logger: AppLogger) {
    this.logger = logger.child({ context: PrismaExceptionFilter.name });
  }

  /**
   * Intercepts a Prisma error, converts it to an AppError, and sends a
   * structured JSON response to the client.
   *
   * @param exception - The raw Prisma error thrown by the ORM layer
   * @param host - NestJS arguments host (HTTP context)
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Convert to AppError using the shared handler
    const appError = isPrismaError(exception)
      ? handlePrismaError(exception)
      : handlePrismaError(exception);

    const requestId = (request.headers['x-request-id'] as string) || undefined;

    const responseBody = {
      ...appError.toResponse(process.env.NODE_ENV !== 'production'),
      path: request.url,
      method: request.method,
      ...(requestId ? { requestId } : {}),
    };

    // Log at appropriate level
    if (appError.statusCode >= 500) {
      this.logger.error('Prisma server error', {
        code: appError.code,
        statusCode: appError.statusCode,
        path: request.url,
        method: request.method,
        prismaError: exception instanceof Error ? exception.message : String(exception),
      });
    } else {
      this.logger.warn('Prisma client error', {
        code: appError.code,
        statusCode: appError.statusCode,
        path: request.url,
        method: request.method,
      });
    }

    response.status(appError.statusCode).send(responseBody);
  }
}
