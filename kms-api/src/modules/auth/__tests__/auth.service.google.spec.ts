/**
 * auth.service.google.spec.ts
 *
 * Unit tests for AuthService.googleLogin() and GoogleStrategy.validate().
 * UserRepository is fully mocked — no DB calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserStatus, UserRole } from '@prisma/client';

import { AuthService } from '../auth.service';
import { GoogleStrategy } from '../strategies/google.strategy';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ApiKeyRepository } from '../../../database/repositories/api-key.repository';
import { AppConfigService } from '../../../config/config.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'user-uuid',
    email: 'google@example.com',
    passwordHash: null,
    firstName: 'Google',
    lastName: 'User',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    metadata: null,
    ...overrides,
  };
}

function makeGoogleProfile(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'google-profile-id-123',
    displayName: 'Google User',
    name: { givenName: 'Google', familyName: 'User' },
    emails: [{ value: 'google@example.com', verified: true }],
    photos: [],
    ...overrides,
  };
}

const MOCK_TOKENS = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 900,
  tokenType: 'Bearer',
};

// ---------------------------------------------------------------------------
// AuthService.googleLogin() tests
// ---------------------------------------------------------------------------

describe('AuthService.googleLogin()', () => {
  let authService: AuthService;
  let userRepository: jest.Mocked<UserRepository>;
  let prismaService: { refreshToken: { create: jest.Mock } };

  beforeEach(async () => {
    const mockUserRepository: Partial<jest.Mocked<UserRepository>> = {
      findByEmail: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateLastLogin: jest.fn(),
      incrementFailedLogin: jest.fn(),
    };

    const mockApiKeyRepository: Partial<jest.Mocked<ApiKeyRepository>> = {
      hasReachedKeyLimit: jest.fn(),
      create: jest.fn(),
    };

    const mockJwtService: Partial<jest.Mocked<JwtService>> = {
      signAsync: jest.fn().mockResolvedValue('jwt-token'),
      verifyAsync: jest.fn(),
    };

    const mockConfig = {
      auth: {
        jwtAccessSecret: 'access-secret',
        jwtRefreshSecret: 'refresh-secret',
        jwtAccessExpiration: '15m',
        jwtRefreshExpiration: '7d',
        googleClientId: 'google-client-id',
        googleClientSecret: 'google-client-secret',
        googleCallbackUrl: 'http://localhost/callback',
      },
    };

    prismaService = {
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
    };

    const mockCacheService: Partial<jest.Mocked<CacheService>> = {
      exists: jest.fn().mockResolvedValue(false),
      set: jest.fn(),
    };

    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
      assign: jest.fn(),
      bindings: jest.fn(),
      level: 'info',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: ApiKeyRepository, useValue: mockApiKeyRepository },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AppConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: prismaService },
        { provide: CacheService, useValue: mockCacheService },
        {
          provide: 'PinoLogger:AuthService',
          useValue: mockLogger,
        },
      ],
    })
      .overrideProvider('PinoLogger:AuthService')
      .useValue(mockLogger)
      .compile();

    authService = module.get<AuthService>(AuthService);
    userRepository = module.get(UserRepository);
  });

  it('returns tokens and user info when user is ACTIVE', async () => {
    // Arrange
    const activeUser = makeUser({ status: UserStatus.ACTIVE });
    (userRepository.updateLastLogin as jest.Mock).mockResolvedValue(undefined);

    // Act
    const result = await authService.googleLogin(activeUser);

    // Assert
    expect(result).toHaveProperty('tokens');
    expect(result).toHaveProperty('user');
    expect(result.user.id).toBe(activeUser.id);
    expect(result.user.email).toBe(activeUser.email);
    expect(result.tokens).toHaveProperty('accessToken');
  });

  it('throws OAUTH_FAILED error when user status is SUSPENDED', async () => {
    // Arrange
    const suspendedUser = makeUser({ status: UserStatus.SUSPENDED });

    // Act & Assert
    await expect(authService.googleLogin(suspendedUser)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.OAUTH_FAILED.code,
    });
  });

  it('throws OAUTH_FAILED error when user status is INACTIVE', async () => {
    // Arrange
    const inactiveUser = makeUser({ status: UserStatus.INACTIVE });

    // Act & Assert
    await expect(authService.googleLogin(inactiveUser)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.OAUTH_FAILED.code,
    });
  });

  it('calls updateLastLogin with the user ID on successful login', async () => {
    // Arrange
    const activeUser = makeUser({ status: UserStatus.ACTIVE });
    (userRepository.updateLastLogin as jest.Mock).mockResolvedValue(undefined);

    // Act
    await authService.googleLogin(activeUser);

    // Assert
    expect(userRepository.updateLastLogin).toHaveBeenCalledWith(activeUser.id);
  });
});

// ---------------------------------------------------------------------------
// GoogleStrategy.validate() tests
// ---------------------------------------------------------------------------

describe('GoogleStrategy.validate()', () => {
  let googleStrategy: GoogleStrategy;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    const mockUserRepository: Partial<jest.Mocked<UserRepository>> = {
      findByEmail: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockConfig = {
      auth: {
        googleClientId: 'test-client-id',
        googleClientSecret: 'test-client-secret',
        googleCallbackUrl: 'http://localhost/callback',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleStrategy,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    googleStrategy = module.get<GoogleStrategy>(GoogleStrategy);
    userRepository = module.get(UserRepository);
  });

  it('creates a new user when email is not found in DB', async () => {
    // Arrange
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
    const newUser = makeUser({ status: UserStatus.ACTIVE, emailVerified: true });
    (userRepository.create as jest.Mock).mockResolvedValue(newUser);

    const profile = makeGoogleProfile();
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profile, done);

    // Assert
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'google@example.com',
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    expect(done).toHaveBeenCalledWith(null, newUser);
  });

  it('logs in an existing ACTIVE user without creating a duplicate', async () => {
    // Arrange
    const existingUser = makeUser({ status: UserStatus.ACTIVE });
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(existingUser);

    const profile = makeGoogleProfile();
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profile, done);

    // Assert — no new user created
    expect(userRepository.create).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith(null, existingUser);
  });

  it('activates a PENDING_VERIFICATION user (Google confirms email)', async () => {
    // Arrange
    const pendingUser = makeUser({
      status: UserStatus.PENDING_VERIFICATION,
      emailVerified: false,
    });
    const activatedUser = makeUser({ status: UserStatus.ACTIVE, emailVerified: true });

    (userRepository.findByEmail as jest.Mock).mockResolvedValue(pendingUser);
    (userRepository.update as jest.Mock).mockResolvedValue(activatedUser);

    const profile = makeGoogleProfile();
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profile, done);

    // Assert — user was updated to ACTIVE
    expect(userRepository.update).toHaveBeenCalledWith(
      { id: pendingUser.id },
      expect.objectContaining({
        emailVerified: true,
        status: UserStatus.ACTIVE,
      }),
    );
    expect(done).toHaveBeenCalledWith(null, activatedUser);
  });

  it('rejects a SUSPENDED user with ACCOUNT_SUSPENDED error', async () => {
    // Arrange
    const suspendedUser = makeUser({ status: UserStatus.SUSPENDED });
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(suspendedUser);

    const profile = makeGoogleProfile();
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profile, done);

    // Assert — done called with an error, no user
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ code: ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code }),
    );
  });

  it('throws when Google profile has no email', async () => {
    // Arrange
    const profileNoEmail = makeGoogleProfile({ emails: [] });
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profileNoEmail, done);

    // Assert — done called with OAUTH_FAILED error
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ code: ERROR_CODES.AUT.OAUTH_FAILED.code }),
    );
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('new user created via Google has emailVerified=true and status=ACTIVE', async () => {
    // Arrange
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
    const createdUser = makeUser({ status: UserStatus.ACTIVE, emailVerified: true });
    (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

    const profile = makeGoogleProfile();
    const done = jest.fn();

    // Act
    await googleStrategy.validate('access', 'refresh', profile, done);

    // Assert
    const createCall = (userRepository.create as jest.Mock).mock.calls[0][0];
    expect(createCall.emailVerified).toBe(true);
    expect(createCall.status).toBe(UserStatus.ACTIVE);
  });
});
