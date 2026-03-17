import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, UserStatus, UserRole, ApiKey } from '@prisma/client';
import { AppConfigService } from '../../config/config.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { ApiKeyRepository } from '../../database/repositories/api-key.repository';
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
  CreateApiKeyDto,
  CreateApiKeyResponseDto,
  ApiKeyResponseDto,
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
    private readonly apiKeyRepository: ApiKeyRepository,
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
        ERROR_CODES.AUT.INVALID_CREDENTIALS.code,
        'Invalid email or password',
      );
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (1000 * 60),
      );
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.ACCOUNT_LOCKED.code,
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
          ERROR_CODES.AUT.ACCOUNT_LOCKED.code,
          `Account locked due to too many failed attempts. Try again in ${AUTH.ACCOUNT_LOCK_DURATION_MINUTES} minutes`,
        );
      }

      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.INVALID_CREDENTIALS.code,
        'Invalid email or password',
      );
    }

    // Check account status
    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_NOT_VERIFIED.code,
          'Please verify your email before logging in',
        );
      }
      if (user.status === UserStatus.SUSPENDED) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code,
          'Account has been suspended',
        );
      }
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.UNAUTHENTICATED.code,
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
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID.code,
          'Invalid refresh token',
        );
      }

      // Get user
      const user = await this.userRepository.findUnique({ id: payload.sub });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID.code,
          'User not found or inactive',
        );
      }

      // Generate new tokens
      return this.generateTokens(user);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_EXPIRED.code,
          'Refresh token has expired',
        );
      }
      if (error instanceof Error && error.name === 'JsonWebTokenError') {
        throw ErrorFactory.authentication(
          ERROR_CODES.AUT.REFRESH_TOKEN_INVALID.code,
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
        ERROR_CODES.AUT.INVALID_CREDENTIALS.code,
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
   * Invalidates a user's current session by revoking all refresh tokens.
   * Optionally revokes a specific refresh token if supplied.
   * @param userId - Authenticated user ID
   * @param refreshToken - Optional refresh token to invalidate
   */
  @Trace({ name: 'auth.logout' })
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hash(refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all refresh tokens for the user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    this.logger.log(`User logged out: ${userId}`);
  }

  /**
   * Finds or creates a user from a Google OAuth profile.
   * Called internally by GoogleStrategy after successful OAuth validation.
   * @param user - Validated user returned by GoogleStrategy
   * @returns Auth tokens and user info (same shape as login)
   */
  @Trace({ name: 'auth.googleLogin' })
  async googleLogin(user: User): Promise<{ tokens: AuthTokens; user: any }> {
    if (user.status !== UserStatus.ACTIVE) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.OAUTH_FAILED.code,
        'Account is not active',
      );
    }

    await this.userRepository.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user);

    this.logger.log(`User logged in via Google OAuth: ${user.email}`);

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
   * Generates a new API key for a user.
   * The plaintext key is returned only once and never stored.
   * @param userId - Owner user ID
   * @param dto - API key creation parameters
   * @returns Plaintext key and metadata record
   */
  @Trace({ name: 'auth.createApiKey' })
  async createApiKey(userId: string, dto: CreateApiKeyDto): Promise<CreateApiKeyResponseDto> {
    // Enforce per-user key limit
    const hasReachedLimit = await this.apiKeyRepository.hasReachedKeyLimit(
      userId,
      AUTH.MAX_API_KEYS_PER_USER,
    );

    if (hasReachedLimit) {
      throw ErrorFactory.validation(
        ERROR_CODES.VAL.INVALID_INPUT.code,
        `API key limit reached. Maximum ${AUTH.MAX_API_KEYS_PER_USER} active keys allowed.`,
      );
    }

    // Generate random key: kms_ prefix + 40 random hex chars
    const rawSecret = randomBytes(20).toString('hex'); // 40 chars
    const plaintext = `${AUTH.API_KEY_PREFIX}${rawSecret}`;

    // Store hash only
    const keyHash = this.hash(plaintext);
    const keyPrefix = plaintext.substring(0, 12); // e.g. "kms_12ab34cd"

    const apiKey = await this.apiKeyRepository.create({
      user: { connect: { id: userId } },
      name: dto.name,
      keyHash,
      keyPrefix,
      scopes: dto.scopes ?? [],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });

    this.logger.log(`API key created for user: ${userId}, key: ${keyPrefix}...`);

    return {
      key: plaintext,
      apiKey: this.mapApiKeyToResponseDto(apiKey),
    };
  }

  /**
   * Returns the list of API keys owned by a user (metadata only, no key values).
   * @param userId - Owner user ID
   * @returns Array of API key metadata
   */
  @Trace({ name: 'auth.listApiKeys' })
  async listApiKeys(userId: string): Promise<ApiKeyResponseDto[]> {
    const keys = await this.apiKeyRepository.findByUserId(userId);
    return keys.map((k) => this.mapApiKeyToResponseDto(k));
  }

  /**
   * Revokes an API key by ID.
   * Verifies the key belongs to the requesting user before revoking.
   * @param userId - Authenticated user ID
   * @param keyId - API key ID to revoke
   */
  @Trace({ name: 'auth.revokeApiKey' })
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findUnique({ id: keyId });

    if (!apiKey || apiKey.userId !== userId) {
      throw ErrorFactory.notFound('API key', keyId);
    }

    await this.apiKeyRepository.revoke(keyId);

    this.logger.log(`API key revoked: ${keyId} for user: ${userId}`);
  }

  /**
   * Maps a Prisma ApiKey entity to ApiKeyResponseDto.
   * @param apiKey - Prisma ApiKey entity
   * @returns API key response DTO
   */
  private mapApiKeyToResponseDto(apiKey: ApiKey): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      status: apiKey.status,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt ?? undefined,
      lastUsedAt: apiKey.lastUsedAt ?? undefined,
      createdAt: apiKey.createdAt,
    };
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
          expiresIn: this.config.auth.jwtAccessExpiration as any,
        },
      ),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.config.auth.jwtRefreshSecret,
          expiresIn: this.config.auth.jwtRefreshExpiration as any,
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
