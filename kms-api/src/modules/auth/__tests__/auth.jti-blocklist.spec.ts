/**
 * Tests for JTI blocklist replay-attack detection in AuthService.refreshToken().
 *
 * PRD: PRD-M01-authentication.md — Redis JTI blocklist
 * Gap: The main auth.service.spec.ts mocks CacheService without an `exists`
 * method, so the replay-detection branch (blocklisted === true) was never
 * exercised.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UserStatus, UserRole } from '@prisma/client';
import { getLoggerToken } from 'nestjs-pino';
import { AuthService } from '../auth.service';
import { AppConfigService } from '../../../config/config.service';
import { UserRepository } from '../../../database/repositories/user.repository';
import { ApiKeyRepository } from '../../../database/repositories/api-key.repository';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { CacheService } from '../../../cache/cache.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
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
// CacheService mock — includes `exists` for blocklist checks
// ---------------------------------------------------------------------------

const mockCacheService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(false),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AuthService — JTI blocklist (replay detection)', () => {
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
        { provide: CacheService, useValue: mockCacheService },
        { provide: getLoggerToken(AuthService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();

    // Safe defaults
    mockJwtService.signAsync.mockResolvedValue('mock-jwt-token');
    mockPrismaService.refreshToken.create.mockResolvedValue({});
    mockCacheService.exists.mockResolvedValue(false);
  });

  // -------------------------------------------------------------------------
  // Happy path — JTI not blocklisted
  // -------------------------------------------------------------------------

  it('issues new token pair when JTI is not in the blocklist', async () => {
    const user = makeUser();
    const jti = 'valid-jti-abc123';

    mockJwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti,
      exp: Math.floor(Date.now() / 1000) + 600, // 10 min from now
    });
    mockUserRepository.findUnique.mockResolvedValue(user);
    mockCacheService.exists.mockResolvedValue(false); // NOT blocklisted

    const result = await service.refreshToken({ refreshToken: 'valid-token' });

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    // The old JTI should now be added to the blocklist
    expect(mockCacheService.set).toHaveBeenCalledWith(
      expect.stringContaining(`jti:blocklist:${jti}`),
      expect.anything(),
      expect.any(Number),
    );
  });

  // -------------------------------------------------------------------------
  // Replay attack — JTI already in blocklist
  // -------------------------------------------------------------------------

  it('throws 401 when the JTI is already in the Redis blocklist (replay attack)', async () => {
    const user = makeUser();
    const reusedJti = 'already-used-jti-xyz';

    mockJwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti: reusedJti,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    mockUserRepository.findUnique.mockResolvedValue(user);
    mockCacheService.exists.mockResolvedValue(true); // IS blocklisted

    await expect(service.refreshToken({ refreshToken: 'reused-token' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('checks the correct Redis key for the JTI blocklist', async () => {
    const user = makeUser();
    const jti = 'test-jti-to-check';

    mockJwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    mockUserRepository.findUnique.mockResolvedValue(user);
    mockCacheService.exists.mockResolvedValue(false);

    await service.refreshToken({ refreshToken: 'some-token' });

    expect(mockCacheService.exists).toHaveBeenCalledWith(
      expect.stringContaining(jti),
    );
  });

  // -------------------------------------------------------------------------
  // Token expiry on refresh
  // -------------------------------------------------------------------------

  it('throws 401 when the refresh token has expired (TokenExpiredError)', async () => {
    const error = new Error('jwt expired');
    error.name = 'TokenExpiredError';
    mockJwtService.verifyAsync.mockRejectedValue(error);

    await expect(service.refreshToken({ refreshToken: 'expired-token' })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('does not call cache.exists when token verification fails (no JTI to check)', async () => {
    const error = new Error('jwt malformed');
    error.name = 'JsonWebTokenError';
    mockJwtService.verifyAsync.mockRejectedValue(error);

    await service.refreshToken({ refreshToken: 'bad-token' }).catch(() => {});

    expect(mockCacheService.exists).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // JTI blocklist TTL is capped to remaining token lifetime
  // -------------------------------------------------------------------------

  it('stores the JTI blocklist entry with a positive TTL', async () => {
    const user = makeUser();
    const futureExp = Math.floor(Date.now() / 1000) + 300; // 5 min from now

    mockJwtService.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
      jti: 'some-jti',
      exp: futureExp,
    });
    mockUserRepository.findUnique.mockResolvedValue(user);
    mockCacheService.exists.mockResolvedValue(false);

    await service.refreshToken({ refreshToken: 'valid-token' });

    const setCall = (mockCacheService.set as jest.Mock).mock.calls.find(([key]: [string]) =>
      key.includes('jti:blocklist'),
    );
    expect(setCall).toBeDefined();
    const [, , ttl] = setCall;
    expect(typeof ttl).toBe('number');
    expect(ttl).toBeGreaterThan(0);
  });
});
