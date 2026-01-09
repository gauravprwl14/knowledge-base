import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';

/**
 * API Key Authentication Guard
 *
 * Protects routes with API key authentication via X-API-Key header.
 *
 * @example
 * ```typescript
 * @UseGuards(ApiKeyAuthGuard)
 * @Controller('external')
 * export class ExternalController {}
 * ```
 */
@Injectable()
export class ApiKeyAuthGuard extends AuthGuard('api-key') {
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
   * Handles authentication result and attaches user/apiKey to request
   */
  handleRequest(err: any, result: any, info: any, context: ExecutionContext) {
    if (err) {
      throw err;
    }

    if (!result) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_INVALID,
        'Valid API key required',
      );
    }

    // Attach both user and apiKey to request
    const request = context.switchToHttp().getRequest();
    request.user = result.user;
    request.apiKey = result.apiKey;

    return result.user;
  }
}
