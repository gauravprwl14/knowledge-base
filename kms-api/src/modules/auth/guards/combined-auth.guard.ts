import { Injectable, ExecutionContext, CanActivate } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { AUTH } from '../../../config/constants/app.constants';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

/**
 * Combined Authentication Guard
 *
 * Supports both JWT Bearer tokens and API key authentication.
 * Automatically detects which auth method to use based on headers.
 *
 * Priority:
 * 1. X-API-Key header → API Key authentication
 * 2. Authorization: Bearer → JWT authentication
 *
 * @example
 * ```typescript
 * // Global guard
 * app.useGlobalGuards(new CombinedAuthGuard(reflector, jwtGuard, apiKeyGuard));
 *
 * // Controller-level
 * @UseGuards(CombinedAuthGuard)
 * @Controller('api')
 * export class ApiController {}
 * ```
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly apiKeyAuthGuard: ApiKeyAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Check for API Key first
    if (request.headers[AUTH.API_KEY_HEADER]) {
      return this.apiKeyAuthGuard.canActivate(context) as Promise<boolean>;
    }

    // Fall back to JWT
    if (request.headers[AUTH.AUTHORIZATION_HEADER]) {
      return this.jwtAuthGuard.canActivate(context) as Promise<boolean>;
    }

    // No authentication provided
    return this.jwtAuthGuard.canActivate(context) as Promise<boolean>;
  }
}
