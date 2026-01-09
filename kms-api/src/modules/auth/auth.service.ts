import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserStatus, UserRole } from '@prisma/client';
import { AppConfigService } from '../../config/config.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';
import { AUTH } from '../../config/constants/app.constants';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ChangePasswordDto,
  AuthTokens,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * AuthService handles authentication operations:
 * - User registration
 * - Login/logout
 * - Token generation and refresh
 * - Password management
 *
 * @example
 * ```typescript
 * @Controller('auth')
 * export class AuthController {
 *   constructor(private readonly authService: AuthService) {}
 *
 *   @Post('login')
 *   async login(@Body() dto: LoginDto) {
 *     return this.authService.login(dto);
 *   }
 * }
 * ```
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly config: AppConfigService,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Registers a new user
   * @param dto - Registration data
   * @returns Created user (without password)
   */
  @Trace({ name: 'auth.register' })
  async register(dto: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    // Check if email already exists
    const existingUser = await this.userRepository.findByEmail(dto.email);
    if (existingUser) {
      throw ErrorFactory.conflict('User', dto.email);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = await this.userRepository.create({
      email: dto.email.toLowerCase(),
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.USER,
      status: UserStatus.PENDING_VERIFICATION,
    });

    this.logger.log(`User registered: ${user.email}`);

    // Remove password hash from response
    const { passwordHash: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Authenticates a user and returns tokens
   * @param dto - Login credentials
   * @returns Auth tokens and user info
   */
  @Trace({ name: 'auth.login' })
  async login(dto: LoginDto): Promise<{ tokens: AuthTokens; user: any }> {
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user || !user.passwordHash) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (1000 * 60),
      );
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.ACCOUNT_LOCKED,
        `Account locked. Try again in ${remainingMinutes} minutes`,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      // Increment failed login count
      const newFailedCount = user.failedLoginCount + 1;
      const shouldLock = newFailedCount >= AUTH.MAX_FAILED_LOGIN_ATTEMPTS;

      await this.userRepository.incrementFailedLogin(
        user.id,
        shouldLock ? AUTH.ACCOUNT_LOCK_DURATION_MINUTES : 0,
      );

      if (shouldLock) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_LOCKED,
          `Account locked due to too many failed attempts. Try again in ${AUTH.ACCOUNT_LOCK_DURATION_MINUTES} minutes`,
        );
      }

      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_NOT_VERIFIED,
          'Please verify your email before logging in',
        );
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_SUSPENDED,
          'Account has been suspended',
        );
      }
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED,
        'Account is not active',
      );
    }

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.generateTokens(user);

    this.logger.log(`User logged in: ${user.email}`);

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  /**
   * Refreshes access token using refresh token
   * @param dto - Refresh token
   * @returns New auth tokens
   */
  @Trace({ name: 'auth.refresh' })
  async refreshToken(dto: RefreshTokenDto): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.config.auth.jwtRefreshSecret,
      });

      if (payload.type !== 'refresh') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID,
          'Invalid refresh token',
        );
      }

      // Get user
      const user = await this.userRepository.findUnique({ id: payload.sub });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID,
          'User not found or inactive',
        );
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_EXPIRED,
          'Refresh token has expired',
        );
      }
      if (error.name === 'JsonWebTokenError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID,
          'Invalid refresh token',
        );
      }
      throw error;
    }
  }

  /**
   * Changes user password
   * @param userId - User ID
   * @param dto - Password change data
   */
  @Trace({ name: 'auth.changePassword' })
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findUnique({ id: userId });

    if (!user || !user.passwordHash) {
      throw ErrorFactory.notFound('User', userId);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.INVALID_CREDENTIALS,
        'Current password is incorrect',
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

    // Update password
    await this.userRepository.update({ id: userId }, { passwordHash });

    this.logger.log(`Password changed for user: ${user.email}`);
  }

  /**
   * Generates JWT access and refresh tokens
   * @param user - User entity
   * @returns Auth tokens
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, type: 'access' },
        {
          secret: this.config.auth.jwtAccessSecret,
          expiresIn: this.config.auth.jwtAccessExpiration,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.config.auth.jwtRefreshSecret,
          expiresIn: this.config.auth.jwtRefreshExpiration,
        },
      ),
    ]);

    // Parse expiration time
    const expiresIn = this.parseExpirationTime(this.config.auth.jwtAccessExpiration);

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Parses expiration string to seconds
   * @param expiration - Expiration string (e.g., '15m', '7d')
   * @returns Expiration in seconds
   */
  private parseExpirationTime(expiration: string): number {
    const match = expiration.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  /**
   * Hashes a string using SHA-256
   */
  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
