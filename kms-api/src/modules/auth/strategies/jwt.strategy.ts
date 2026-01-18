import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfigService } from '../../../config/config.service';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';
import { UserStatus } from '@prisma/client';

/**
 * JWT payload interface
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * JWT Strategy for Passport authentication
 *
 * Validates JWT tokens and attaches user to request.
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 * ```
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: AppConfigService,
    private readonly userRepository: UserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtAccessSecret,
    });
  }

  /**
   * Validates JWT payload and returns user
   * @param payload - Decoded JWT payload
   * @returns User entity
   * @throws UnauthorizedException if user not found or inactive
   */
  async validate(payload: JwtPayload): Promise<any> {
    // Ensure this is an access token
    if (payload.type !== 'access') {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.TOKEN_INVALID.code,
        'Invalid token type',
      );
    }

    const user = await this.userRepository.findUnique({ id: payload.sub });

    if (!user) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
        'User not found',
      );
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.SUSPENDED) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code,
          'Account has been suspended',
        );
      }
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_NOT_VERIFIED.code,
          'Email verification required',
        );
      }
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
        'Account is not active',
      );
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.ACCOUNT_LOCKED.code,
        'Account is temporarily locked',
      );
    }

    // Return user (will be attached to request.user)
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
