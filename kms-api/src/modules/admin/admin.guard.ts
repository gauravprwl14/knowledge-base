import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserRole } from '@prisma/client';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';

/**
 * AdminGuard — restricts access to routes to users with the ADMIN role.
 *
 * Assumes JwtAuthGuard has already run and attached `req.user`.
 * Throws HTTP 403 with error code `KBAUT0010` for any non-ADMIN request.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, AdminGuard)
 * @Controller('admin')
 * export class AdminController {}
 * ```
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectPinoLogger(AdminGuard.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Evaluates whether the authenticated user has the ADMIN role.
   * @param context - Execution context providing access to the HTTP request.
   * @returns `true` if the user is an ADMIN.
   * @throws AppError (403 / KBAUT0010) if the user is not an ADMIN or unauthenticated.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn({ event: 'admin.guard.deny', reason: 'no_user' }, 'AdminGuard: unauthenticated request');
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
        'Authentication required',
      );
    }

    if (user.role !== UserRole.ADMIN) {
      this.logger.warn(
        { event: 'admin.guard.deny', userId: user.id, role: user.role },
        'AdminGuard: insufficient role',
      );
      throw ErrorFactory.fromCode(
        ERROR_CODES.AUT.ADMIN_ACCESS_REQUIRED.code,
        { message: 'Admin access required' },
      );
    }

    this.logger.debug({ event: 'admin.guard.allow', userId: user.id }, 'AdminGuard: access granted');
    return true;
  }
}
