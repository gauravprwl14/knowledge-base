import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';

/**
 * JWT Authentication Guard
 *
 * Protects routes with JWT bearer token authentication.
 * Can be bypassed with @Public() decorator.
 *
 * @example
 * ```typescript
 * // Global guard
 * app.useGlobalGuards(new JwtAuthGuard(reflector));
 *
 * // Controller-level
 * @UseGuards(JwtAuthGuard)
 * @Controller('users')
 * export class UsersController {}
 *
 * // Public route
 * @Public()
 * @Get('status')
 * getStatus() {}
 * ```
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Checks if route is public or requires authentication
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  /**
   * Handles authentication errors
   */
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      // Handle specific JWT errors
      if (info?.name === 'TokenExpiredError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.TOKEN_EXPIRED.code,
          'Access token has expired',
        );
      }

      if (info?.name === 'JsonWebTokenError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.TOKEN_INVALID.code,
          'Invalid access token',
        );
      }

      if (info?.name === 'NotBeforeError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.TOKEN_INVALID.code,
          'Token not yet active',
        );
      }

      if (err) {
        throw err;
      }

      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
        'Authentication required',
      );
    }

    return user;
  }
}
