import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserStatus, UserRole } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { AuthService } from './auth.service';
import { AppConfigService } from '../../config/config.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { ApiKeyRepository } from '../../database/repositories/api-key.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ErrorFactory } from '../../errors/types/error-factory';

// ---------------------------------------------------------------------------
// Module-level bcrypt mock (ensures the same reference used by auth.service)
// ---------------------------------------------------------------------------
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (overrides: Partial<ReturnType<typeof makeUser>> = {}) => ({
  id: 'user-id-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$hash',
  firstName: 'Test',
  lastName: 'User',
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  emailVerified: true,
  emailVerifiedAt: new Date(),
  lastLoginAt: null,
  failedLoginCount: 0,
  lockedUntil: null,
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUserRepository = {
  findByEmail: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateLastLogin: jest.fn(),
  incrementFailedLogin: jest.fn(),
};

const mockApiKeyRepository = {
  hasReachedKeyLimit: jest.fn(),
  create: jest.fn(),
  findByUserId: jest.fn(),
  findUnique: jest.fn(),
  revoke: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-token'),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  auth: {
    jwtAccessSecret: 'access-secret-32-chars-minimum-here',
    jwtAccessExpiration: '15m',
    jwtRefreshSecret: 'refresh-secret-32-chars-minimum-here',
    jwtRefreshExpiration: '7d',
    apiKeyEncryptionSecret: 'encryption-secret-32-chars-min-here',
  },
};

const mockPrismaService = {
  refreshToken: {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AppConfigService, useValue: mockConfig },
        { provide: JwtService, useValue: mockJwtService },
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: ApiKeyRepository, useValue: mockApiKeyRepository },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getLoggerToken(AuthService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();

    // Default mock for signAsync
    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');

    // Default bcrypt mocks
    (bcrypt.hash as jest.Mock).mockResolvedValue('$2b$12$hashedpassword');
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    // Default prisma.refreshToken.create mock
    mockPrismaService.refreshToken.create.mockResolvedValue({});
  });

  // -------------------------------------------------------------------------
  // register
  // -------------------------------------------------------------------------
  describe('register', () => {
    it('should create a user with a hashed password and return user without passwordHash', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        firstName: 'New',
        lastName: 'User',
      };

      const createdUser = makeUser({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        status: UserStatus.PENDING_VERIFICATION,
      });

      mockUserRepository.findByEmail.mockResolvedValue(null);
      mockUserRepository.create.mockResolvedValue(createdUser);

      const result = await service.register(dto);

      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(dto.email);
      expect(mockUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: dto.email.toLowerCase(),
          role: UserRole.USER,
          status: UserStatus.PENDING_VERIFICATION,
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe(dto.email);
    });

    it('should throw a conflict error when the email already exists', async () => {
      const dto = {
        email: 'existing@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      };

      mockUserRepository.findByEmail.mockResolvedValue(makeUser({ email: dto.email }));

      await expect(service.register(dto)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // login
  // -------------------------------------------------------------------------
  describe('login', () => {
    it('should return tokens and user info when credentials are valid', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      const user = makeUser();

      mockUserRepository.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUserRepository.updateLastLogin.mockResolvedValue(user);

      const result = await service.login(dto);

      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('user');
      expect(result.user.email).toBe(user.email);
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw when user is not found', async () => {
      const dto = { email: 'nobody@example.com', password: 'Password123!' };

      mockUserRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw when the password is wrong', async () => {
      const dto = { email: 'test@example.com', password: 'WrongPassword!' };
      const user = makeUser();

      mockUserRepository.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mockUserRepository.incrementFailedLogin.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw when the account is not verified', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      const user = makeUser({ status: UserStatus.PENDING_VERIFICATION });

      mockUserRepository.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('should throw when the account is locked', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
      const user = makeUser({ lockedUntil });

      mockUserRepository.findByEmail.mockResolvedValue(user);

      await expect(service.login(dto)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('should throw when the account is suspended', async () => {
      const dto = { email: 'test@example.com', password: 'Password123!' };
      const user = makeUser({ status: UserStatus.SUSPENDED });

      mockUserRepository.findByEmail.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.login(dto)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // refreshToken
  // -------------------------------------------------------------------------
  describe('refreshToken', () => {
    it('should return new tokens when the refresh token is valid', async () => {
      const dto = { refreshToken: 'valid-refresh-token' };
      const user = makeUser();

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'refresh',
      });
      mockUserRepository.findUnique.mockResolvedValue(user);

      const result = await service.refreshToken(dto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw when the refresh token has expired', async () => {
      const dto = { refreshToken: 'expired-token' };

      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      mockJwtService.verifyAsync.mockRejectedValue(error);

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw when the refresh token is malformed', async () => {
      const dto = { refreshToken: 'bad-token' };

      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      mockJwtService.verifyAsync.mockRejectedValue(error);

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw when the token type is not "refresh"', async () => {
      const dto = { refreshToken: 'access-token-used-as-refresh' };
      const user = makeUser();

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access', // Wrong type
      });

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });

    it('should throw when the user is inactive', async () => {
      const dto = { refreshToken: 'valid-token' };
      const user = makeUser({ status: UserStatus.SUSPENDED });

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'refresh',
      });
      mockUserRepository.findUnique.mockResolvedValue(user);

      await expect(service.refreshToken(dto)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout', () => {
    it('should revoke all refresh tokens when no specific token is provided', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.logout('user-id-1');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-id-1', revokedAt: null },
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it('should revoke only the specified refresh token when provided', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('user-id-1', 'specific-refresh-token');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-id-1' }),
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // createApiKey
  // -------------------------------------------------------------------------
  describe('createApiKey', () => {
    it('should generate a plaintext key and return it with metadata', async () => {
      const dto = { name: 'My Key' };
      const userId = 'user-id-1';
      const mockApiKey = {
        id: 'key-id-1',
        userId,
        name: dto.name,
        keyHash: 'hash',
        keyPrefix: 'kms_12ab34c',
        status: 'ACTIVE',
        scopes: [],
        expiresAt: null,
        lastUsedAt: null,
        usageCount: 0,
        rateLimit: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        lastUsedIp: null,
      };

      mockApiKeyRepository.hasReachedKeyLimit.mockResolvedValue(false);
      mockApiKeyRepository.create.mockResolvedValue(mockApiKey);

      const result = await service.createApiKey(userId, dto);

      expect(result.key).toMatch(/^kms_[a-f0-9]{40}$/);
      expect(result.apiKey.name).toBe(dto.name);
      expect(result.apiKey.id).toBe('key-id-1');
    });

    it('should throw when the user has reached the API key limit', async () => {
      mockApiKeyRepository.hasReachedKeyLimit.mockResolvedValue(true);

      await expect(service.createApiKey('user-id-1', { name: 'Over Limit' })).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // -------------------------------------------------------------------------
  // revokeApiKey
  // -------------------------------------------------------------------------
  describe('revokeApiKey', () => {
    it('should revoke the key when it belongs to the user', async () => {
      const userId = 'user-id-1';
      const keyId = 'key-id-1';
      const mockApiKey = { id: keyId, userId };

      mockApiKeyRepository.findUnique.mockResolvedValue(mockApiKey);
      mockApiKeyRepository.revoke.mockResolvedValue({ ...mockApiKey, status: 'REVOKED' });

      await service.revokeApiKey(userId, keyId);

      expect(mockApiKeyRepository.revoke).toHaveBeenCalledWith(keyId);
    });

    it('should throw 404 when the key does not exist', async () => {
      mockApiKeyRepository.findUnique.mockResolvedValue(null);

      await expect(service.revokeApiKey('user-id-1', 'nonexistent-key')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('should throw 404 when the key belongs to a different user', async () => {
      mockApiKeyRepository.findUnique.mockResolvedValue({ id: 'key-id-1', userId: 'other-user' });

      await expect(service.revokeApiKey('user-id-1', 'key-id-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
