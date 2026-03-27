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
 * NOTE — Fastify compatibility: Passport's OAuth2 strategy calls
 * `res.statusCode`, `res.setHeader()`, and `res.end()` directly on the
 * response object to issue the 302 redirect to Google. The Fastify reply
 * object does NOT expose these properties directly; they live on `reply.raw`
 * (the underlying Node.js `ServerResponse`). Overriding `getResponse()` to
 * return `reply.raw` lets Passport perform the redirect correctly. We then
 * detect that the raw response has already ended and return `false` from
 * `canActivate` so NestJS does not attempt to write a second response.
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
   * Returns the raw Node.js ServerResponse instead of the Fastify reply so
   * that Passport can call `.statusCode`, `.setHeader()`, and `.end()` on it
   * when issuing the OAuth redirect.
   */
  getResponse(context: ExecutionContext): any {
    const reply = context.switchToHttp().getResponse<{ raw: any }>();
    return reply.raw;
  }

  /**
   * Runs Passport authentication. For the initiation request, Passport will
   * write a 302 redirect directly to the raw response and the promise
   * resolves to `false` (no user). In that case the raw response is already
   * finished so we simply return `false` to prevent NestJS touching it again.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rawRes = this.getResponse(context);
    try {
      const result = await super.canActivate(context);
      return result as boolean;
    } catch (err) {
      // If the raw response was already sent (Passport issued the redirect),
      // swallow the error and return false — the response is already done.
      if (rawRes.headersSent || rawRes.writableEnded) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Disables Passport session persistence.
   *
   * By default, `passport.authenticate` calls `req.logIn(user, ...)` after a
   * successful OAuth exchange, which in turn calls
   * `SessionManager.logIn → req.session.regenerate(...)`.  Fastify has no
   * `req.session` unless `@fastify/session` is registered, so the call throws:
   *   "Login sessions require session support. Did you forget to use
   *    `express-session` middleware?"
   *
   * This API is stateless (JWT-only), so sessions are never needed.
   * Returning `{ session: false }` instructs Passport to skip session
   * serialisation entirely and just attach the user to `req.user`.
   */
  getAuthenticateOptions(_context: ExecutionContext): Record<string, unknown> {
    return { session: false };
  }

  /**
   * Handles authentication errors and attaches user to request.
   * Called only on the callback route after Google redirects back.
   */
  handleRequest(err: any, user: any, _info: any, _context: ExecutionContext) {
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
