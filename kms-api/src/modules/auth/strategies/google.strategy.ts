import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AppConfigService } from '../../../config/config.service';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';
import { UserRole, UserStatus } from '@prisma/client';

/**
 * Google OAuth 2.0 Strategy for Passport authentication.
 *
 * Validates Google OAuth tokens and finds or creates the corresponding user.
 *
 * @example
 * ```typescript
 * @UseGuards(GoogleAuthGuard)
 * @Get('google')
 * googleLogin() {}
 *
 * @UseGuards(GoogleAuthGuard)
 * @Get('google/callback')
 * googleCallback(@CurrentUser() user: User) {}
 * ```
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly userRepository: UserRepository,
  ) {
    super({
      clientID: config.auth.googleClientId || 'GOOGLE_CLIENT_ID_NOT_SET',
      clientSecret: config.auth.googleClientSecret || 'GOOGLE_CLIENT_SECRET_NOT_SET',
      callbackURL: config.auth.googleCallbackUrl || 'http://localhost:8000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  /**
   * Validates Google profile and finds or creates the user.
   * @param _accessToken - Google access token (not stored)
   * @param _refreshToken - Google refresh token (not stored)
   * @param profile - Google user profile
   * @param done - Passport verify callback
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;

      if (!email) {
        return done(
          ErrorFactory.authentication(
            ERROR_CODES.AUT.OAUTH_FAILED.code,
            'Google account does not have an associated email',
          ),
        );
      }

      const normalizedEmail = email.toLowerCase();
      let user = await this.userRepository.findByEmail(normalizedEmail);

      if (user) {
        // User already exists — allow login regardless of provider
        if (user.status === UserStatus.SUSPENDED) {
          return done(
            ErrorFactory.authentication(
              ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code,
              'Account has been suspended',
            ),
          );
        }

        // If account is pending verification, activate it (Google confirms email)
        if (user.status === UserStatus.PENDING_VERIFICATION) {
          user = await this.userRepository.update(
            { id: user.id },
            {
              emailVerified: true,
              emailVerifiedAt: new Date(),
              status: UserStatus.ACTIVE,
            },
          );
        }
      } else {
        // Create new user via Google OAuth
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || '';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';

        user = await this.userRepository.create({
          email: normalizedEmail,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          metadata: { provider: 'GOOGLE', googleId: profile.id },
        });

        this.logger.log(`New user created via Google OAuth: ${normalizedEmail}`);
      }

      return done(null, user);
    } catch (error) {
      this.logger.error('Google OAuth validation failed', error);
      return done(
        ErrorFactory.authentication(
          ERROR_CODES.AUT.OAUTH_FAILED.code,
          'Google authentication failed',
        ),
      );
    }
  }
}
