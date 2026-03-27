import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Roles Guard
 *
 * Checks if the authenticated user has the required role(s) to access a route.
 *
 * @example
 * ```typescript
 * @UseGuards(RolesGuard)
 * @Roles(UserRole.ADMIN)
 * @Get('admin/users')
 * getAdminUsers() {}
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user attached (authentication should have failed)
    if (!user) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
        'Authentication required',
      );
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.some((role) => user.role === role);

    if (!hasRole) {
      throw ErrorFactory.authorization(
        ERROR_CODES.AUZ.ROLE_REQUIRED.code,
        `Required role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
