import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SECURITY_HEADERS } from '../../config/constants/app.constants';

/**
 * Security Headers Middleware
 *
 * Adds security-related HTTP headers to all responses.
 *
 * Headers added:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - X-XSS-Protection: 1; mode=block
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains
 * - Content-Security-Policy: default-src 'self'
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: geolocation=(), microphone=(), camera=()
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
 *   }
 * }
 * ```
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Apply all security headers
    Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
      res.setHeader(header, value);
    });

    next();
  }
}
