import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';

/**
 * Google OAuth Authentication Guard
 *
 * Initiates the Google OAuth 2.0 flow or handles the callback.
 * Use on both the redirect endpoint and the callback endpoint.
 *
 * @example
 * ```typescript
 * @UseGuards(GoogleAuthGuard)
 * @Get('google')
 * googleLogin() {} // Redirects to Google
 *
 * @UseGuards(GoogleAuthGuard)
 * @Get('google/callback')
 * googleCallback(@CurrentUser() user: User) {} // Handles callback
 * ```
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  /**
   * Handles authentication errors and attaches user to request
   */
  handleRequest(err: any, user: any, info: any, _context: ExecutionContext) {
    if (err) {
      throw err;
    }

    if (!user) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.OAUTH_FAILED.code,
        'Google authentication failed',
      );
    }

    return user;
  }
}
