import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 *
 * Adds a unique request ID to each request for tracing and logging.
 * Uses X-Request-ID header if provided, otherwise generates a new UUID.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(RequestIdMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Use existing request ID from header or generate new one
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Attach to request object
    (req as any).id = requestId;

    // Set response header for client tracking
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}
