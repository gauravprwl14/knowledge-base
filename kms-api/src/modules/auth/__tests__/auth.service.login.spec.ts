/**
 * auth.service.login.spec.ts
 *
 * Unit tests for AuthService.login() and AuthService.register().
 * All dependencies are mocked — no real DB, JWT, or bcrypt calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth.service';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ApiKeyRepository } from '../../../database/repositories/api-key.repository';
import { AppConfigService } from '../../../config/config.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CacheService } from '../../../cache/cache.service';
import { ERROR_CODES } from '../../../errors/error-codes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<Record<string, unknown>> = {}): any {
  return {
    id: 'user-uuid-1',
    email: 'test@example.com',
    passwordHash: '$2b$12$hashedpassword',
    firstName: 'Test',
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

const VALID_PASSWORD = 'ValidPass123!';
const VALID_LOGIN_DTO = { email: 'test@example.com', password: VALID_PASSWORD };
const VALID_REGISTER_DTO = {
  email: 'new@example.com',
  password: 'NewPass123!',
  firstName: 'New',
  lastName: 'User',
};

// ---------------------------------------------------------------------------
// Module setup helper
// ---------------------------------------------------------------------------

async function buildModule(overrides: {
  userRepository?: Partial<jest.Mocked<UserRepository>>;
} = {}) {
  const defaultUserRepository: Partial<jest.Mocked<UserRepository>> = {
    findByEmail: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateLastLogin: jest.fn().mockResolvedValue(undefined),
    incrementFailedLogin: jest.fn().mockResolvedValue(undefined),
  };

  const mockUserRepository = { ...defaultUserRepository, ...overrides.userRepository };

  const mockApiKeyRepository: Partial<jest.Mocked<ApiKeyRepository>> = {
    hasReachedKeyLimit: jest.fn().mockResolvedValue(false),
    create: jest.fn(),
  };

  const mockJwtService: Partial<jest.Mocked<JwtService>> = {
    signAsync: jest.fn().mockResolvedValue('signed-jwt-token'),
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

  const prismaService = {
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
      { provide: 'PinoLogger:AuthService', useValue: mockLogger },
    ],
  })
    .overrideProvider('PinoLogger:AuthService')
    .useValue(mockLogger)
    .compile();

  return {
    authService: module.get<AuthService>(AuthService),
    userRepository: module.get<jest.Mocked<UserRepository>>(UserRepository),
    jwtService: module.get<jest.Mocked<JwtService>>(JwtService),
    prismaService: prismaService,
  };
}

// ---------------------------------------------------------------------------
// login() tests
// ---------------------------------------------------------------------------

describe('AuthService.login()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns { tokens, user } on valid credentials', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    const user = makeUser();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    // Act
    const result = await authService.login(VALID_LOGIN_DTO);

    // Assert
    expect(result).toHaveProperty('tokens');
    expect(result).toHaveProperty('user');
    expect(result.user.email).toBe(user.email);
    expect(result.tokens).toHaveProperty('accessToken');
  });

  it('throws INVALID_CREDENTIALS when password is wrong', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    const user = makeUser();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    // Act & Assert
    await expect(authService.login(VALID_LOGIN_DTO)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.INVALID_CREDENTIALS.code,
    });
  });

  it('throws when user is not found', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

    // Act & Assert
    await expect(authService.login(VALID_LOGIN_DTO)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.INVALID_CREDENTIALS.code,
    });
  });

  it('throws ACCOUNT_SUSPENDED when user status is SUSPENDED', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    const suspendedUser = makeUser({ status: UserStatus.SUSPENDED });
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(suspendedUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    // Act & Assert
    await expect(authService.login(VALID_LOGIN_DTO)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code,
    });
  });

  it('throws ACCOUNT_NOT_VERIFIED when user status is PENDING_VERIFICATION', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    const pendingUser = makeUser({ status: UserStatus.PENDING_VERIFICATION });
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(pendingUser);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    // Act & Assert
    await expect(authService.login(VALID_LOGIN_DTO)).rejects.toMatchObject({
      code: ERROR_CODES.AUT.ACCOUNT_NOT_VERIFIED.code,
    });
  });

  it('calls updateLastLogin on successful login', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    const user = makeUser();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(user);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    // Act
    await authService.login(VALID_LOGIN_DTO);

    // Assert
    expect(userRepository.updateLastLogin).toHaveBeenCalledWith(user.id);
  });
});

// ---------------------------------------------------------------------------
// register() tests
// ---------------------------------------------------------------------------

describe('AuthService.register()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates user with ACTIVE status and emailVerified=true', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

    const createdUser = makeUser({
      email: VALID_REGISTER_DTO.email,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    });
    (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

    // Act
    const result = await authService.register(VALID_REGISTER_DTO);

    // Assert
    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('returns the user without exposing the passwordHash field', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

    const createdUser = makeUser({
      email: VALID_REGISTER_DTO.email,
      passwordHash: '$2b$12$secret',
    });
    (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

    // Act
    const result = await authService.register(VALID_REGISTER_DTO);

    // Assert — passwordHash must be stripped from the response
    expect((result as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('throws CONFLICT when email already exists', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(makeUser());

    // Act & Assert
    await expect(authService.register(VALID_REGISTER_DTO)).rejects.toMatchObject({
      code: ERROR_CODES.DAT.CONFLICT.code,
    });
  });

  it('does not call userRepository.create when email already exists', async () => {
    // Arrange
    const { authService, userRepository } = await buildModule();
    (userRepository.findByEmail as jest.Mock).mockResolvedValue(makeUser());

    // Act
    await authService.register(VALID_REGISTER_DTO).catch(() => {});

    // Assert
    expect(userRepository.create).not.toHaveBeenCalled();
  });
});
