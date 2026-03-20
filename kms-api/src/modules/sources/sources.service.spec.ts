'use strict';
import { Test, TestingModule } from '@nestjs/testing';
import { SourcesService } from './sources.service';
import { SourceRepository } from '../../database/repositories/source.repository';
import { TokenEncryptionService } from './token-encryption.service';
import { AppError } from '../../errors/types/app-error';
import { getLoggerToken } from 'nestjs-pino';
import { SourceType, SourceStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Top-level googleapis mock (must be top-level — jest.mock is hoisted)
// ---------------------------------------------------------------------------

const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?state=user-uuid-001');
const mockGetToken = jest.fn();
const mockSetCredentials = jest.fn();
const mockRefreshAccessToken = jest.fn();
const mockDriveAboutGet = jest.fn();

jest.mock('googleapis', () => {
  const mockOAuth2Client = {
    generateAuthUrl: (...args: unknown[]) => mockGenerateAuthUrl(...args),
    getToken: (...args: unknown[]) => mockGetToken(...args),
    setCredentials: (...args: unknown[]) => mockSetCredentials(...args),
    refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
  };
  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => mockOAuth2Client),
      },
      drive: jest.fn().mockReturnValue({
        about: {
          get: (...args: unknown[]) => mockDriveAboutGet(...args),
        },
      }),
    },
    Auth: {},
  };
});

// ---------------------------------------------------------------------------
// Repository / service mocks
// ---------------------------------------------------------------------------

const mockSourceRepo = {
  findByUserId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  disconnect: jest.fn(),
  findFirst: jest.fn(),
};

const mockTokenEncryption = {
  encrypt: jest.fn().mockReturnValue('encrypted-tokens'),
  decrypt: jest.fn().mockReturnValue(JSON.stringify({ access_token: 'tok', refresh_token: 'ref' })),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userId = 'user-uuid-001';
const sourceId = 'src-uuid-001';

const mockGdriveSource = {
  id: sourceId,
  userId,
  type: SourceType.GOOGLE_DRIVE,
  status: SourceStatus.CONNECTED,
  name: 'user@example.com',
  displayName: 'user@example.com',
  externalId: 'user@example.com',
  encryptedTokens: 'encrypted-tokens',
  configJson: null,
  metadata: null,
  lastSyncedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockLocalSource = {
  id: 'local-src-001',
  userId,
  type: SourceType.LOCAL,
  status: SourceStatus.CONNECTED,
  name: 'documents',
  displayName: 'documents',
  externalId: null,
  encryptedTokens: null,
  configJson: null,
  metadata: { path: '/data/documents' },
  lastSyncedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockObsidianSource = {
  id: 'obsidian-src-001',
  userId,
  type: SourceType.OBSIDIAN,
  status: SourceStatus.CONNECTED,
  name: 'MyVault',
  displayName: 'MyVault',
  externalId: null,
  encryptedTokens: null,
  configJson: null,
  metadata: { path: '/data/vault', vaultPath: '/data/vault' },
  lastSyncedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SourcesService', () => {
  let service: SourcesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourcesService,
        { provide: SourceRepository, useValue: mockSourceRepo },
        { provide: TokenEncryptionService, useValue: mockTokenEncryption },
        { provide: getLoggerToken(SourcesService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get(SourcesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listSources ───────────────────────────────────────────────────────────

  describe('listSources', () => {
    it('returns all sources for a user without sensitive fields', async () => {
      mockSourceRepo.findByUserId.mockResolvedValue([mockGdriveSource]);

      const result = await service.listSources(userId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sourceId);
      expect(result[0]).not.toHaveProperty('encryptedTokens');
      expect(result[0]).not.toHaveProperty('configJson');
    });

    it('returns empty array when user has no sources', async () => {
      mockSourceRepo.findByUserId.mockResolvedValue([]);
      const result = await service.listSources(userId);
      expect(result).toEqual([]);
    });
  });

  // ─── getSource ─────────────────────────────────────────────────────────────

  describe('getSource', () => {
    it('returns the source when found and owned by user', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);

      const result = await service.getSource(sourceId, userId);
      expect(result.id).toBe(sourceId);
    });

    it('throws AppError 404 when source is not found or belongs to another user', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.getSource('wrong-id', userId)).rejects.toThrow(AppError);
    });
  });

  // ─── initiateGoogleDriveOAuth ──────────────────────────────────────────────

  describe('initiateGoogleDriveOAuth', () => {
    it('returns a Google consent URL containing the userId as state', async () => {
      const result = await service.initiateGoogleDriveOAuth(userId);

      expect(result).toHaveProperty('authUrl');
      expect(result.authUrl).toContain(userId);
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          access_type: 'offline',
          prompt: 'consent',
          state: userId,
        }),
      );
    });
  });

  // ─── handleGoogleCallback ──────────────────────────────────────────────────

  describe('handleGoogleCallback', () => {
    it('throws AppError when code is missing', async () => {
      await expect(service.handleGoogleCallback('', userId)).rejects.toThrow(AppError);
    });

    it('throws AppError when userId is missing', async () => {
      await expect(service.handleGoogleCallback('valid-code', '')).rejects.toThrow(AppError);
    });

    it('throws AppError when Google token exchange fails', async () => {
      mockGetToken.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.handleGoogleCallback('bad-code', userId)).rejects.toThrow(AppError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('creates a new source when no existing active source is found', async () => {
      mockGetToken.mockResolvedValue({ tokens: { access_token: 'acc', refresh_token: 'ref' } });
      mockDriveAboutGet.mockResolvedValue({ data: { user: { emailAddress: 'user@example.com' } } });
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue(mockGdriveSource);

      const result = await service.handleGoogleCallback('auth-code', userId);

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: SourceType.GOOGLE_DRIVE,
          status: SourceStatus.CONNECTED,
        }),
      );
      expect(result.id).toBe(sourceId);
    });

    it('updates existing source on reconnect flow', async () => {
      mockGetToken.mockResolvedValue({ tokens: { access_token: 'acc', refresh_token: 'ref' } });
      mockDriveAboutGet.mockResolvedValue({ data: { user: { emailAddress: 'user@example.com' } } });
      mockSourceRepo.findFirst.mockResolvedValue(mockGdriveSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockGdriveSource, status: SourceStatus.CONNECTED });

      const result = await service.handleGoogleCallback('auth-code', userId);

      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: sourceId },
        expect.objectContaining({ status: SourceStatus.CONNECTED }),
      );
      expect(result.id).toBe(sourceId);
    });

    it('falls back to "Google Drive" displayName when drive.about.get fails', async () => {
      mockGetToken.mockResolvedValue({ tokens: { access_token: 'acc', refresh_token: 'ref' } });
      mockDriveAboutGet.mockRejectedValue(new Error('quota exceeded'));
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue({ ...mockGdriveSource, displayName: 'Google Drive' });

      const result = await service.handleGoogleCallback('auth-code', userId);

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Google Drive' }),
      );
      expect(result).toBeDefined();
    });
  });

  // ─── disconnectSource ──────────────────────────────────────────────────────

  describe('disconnectSource', () => {
    it('calls disconnect and resolves when source is active', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);

      await expect(service.disconnectSource(sourceId, userId)).resolves.not.toThrow();
      expect(mockSourceRepo.disconnect).toHaveBeenCalledWith(sourceId);
    });

    it('is idempotent — does not call disconnect when source is already DISCONNECTED', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue({
        ...mockGdriveSource,
        status: SourceStatus.DISCONNECTED,
      });

      await expect(service.disconnectSource(sourceId, userId)).resolves.not.toThrow();
      expect(mockSourceRepo.disconnect).not.toHaveBeenCalled();
    });

    it('throws AppError 404 when source not found', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.disconnectSource('missing', userId)).rejects.toThrow(AppError);
    });
  });

  // ─── getDecryptedTokens ────────────────────────────────────────────────────

  describe('getDecryptedTokens', () => {
    it('returns decrypted credentials for a valid source', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);

      const result = await service.getDecryptedTokens(sourceId, userId);

      expect(mockTokenEncryption.decrypt).toHaveBeenCalledWith('encrypted-tokens');
      expect(result).toEqual({ access_token: 'tok', refresh_token: 'ref' });
    });

    it('throws AppError 404 when source not found', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.getDecryptedTokens('missing', userId)).rejects.toThrow(AppError);
    });

    it('throws AppError 404 when source has no encrypted tokens', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue({ ...mockGdriveSource, encryptedTokens: null });
      await expect(service.getDecryptedTokens(sourceId, userId)).rejects.toThrow(AppError);
    });
  });

  // ─── refreshAccessToken ────────────────────────────────────────────────────

  describe('refreshAccessToken', () => {
    it('refreshes token, persists new credentials, and returns them', async () => {
      const newCreds = { access_token: 'new-acc', refresh_token: 'ref' };
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);
      mockRefreshAccessToken.mockResolvedValue({ credentials: newCreds });
      mockTokenEncryption.encrypt.mockReturnValue('new-encrypted-tokens');
      mockSourceRepo.update.mockResolvedValue(mockGdriveSource);

      const result = await service.refreshAccessToken(sourceId, userId);

      expect(mockSetCredentials).toHaveBeenCalled();
      expect(mockRefreshAccessToken).toHaveBeenCalled();
      expect(mockTokenEncryption.encrypt).toHaveBeenCalledWith(JSON.stringify(newCreds));
      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: sourceId },
        { encryptedTokens: 'new-encrypted-tokens' },
      );
      expect(result).toEqual(newCreds);
    });
  });

  // ─── registerLocalSource ───────────────────────────────────────────────────

  describe('registerLocalSource', () => {
    it('creates a new LOCAL source when none exists', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue(mockLocalSource);

      const result = await service.registerLocalSource(userId, '/data/documents', 'My Docs');

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: SourceType.LOCAL,
          status: SourceStatus.CONNECTED,
          metadata: { path: '/data/documents' },
        }),
      );
      expect(result.id).toBe('local-src-001');
    });

    it('reconnects existing source at the same path', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(mockLocalSource);
      const updatedSource = { ...mockLocalSource, status: SourceStatus.CONNECTED };
      mockSourceRepo.update.mockResolvedValue(updatedSource);

      const result = await service.registerLocalSource(userId, '/data/documents');

      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: 'local-src-001' },
        expect.objectContaining({ status: SourceStatus.CONNECTED }),
      );
      expect(result).toBeDefined();
    });

    it('creates a new source even when an existing source exists at a different path', async () => {
      const differentPathSource = { ...mockLocalSource, metadata: { path: '/other/path' } };
      mockSourceRepo.findFirst.mockResolvedValue(differentPathSource);
      mockSourceRepo.create.mockResolvedValue(mockLocalSource);

      await service.registerLocalSource(userId, '/data/documents');

      expect(mockSourceRepo.create).toHaveBeenCalled();
    });

    it('derives displayName from the path when not provided', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue(mockLocalSource);

      await service.registerLocalSource(userId, '/data/documents');

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'documents' }),
      );
    });
  });

  // ─── registerObsidianVault ─────────────────────────────────────────────────

  describe('registerObsidianVault', () => {
    it('creates a new OBSIDIAN source with metadata.vaultPath', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue(mockObsidianSource);

      const result = await service.registerObsidianVault(userId, '/data/vault', 'My Vault');

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: SourceType.OBSIDIAN,
          status: SourceStatus.CONNECTED,
          metadata: { path: '/data/vault', vaultPath: '/data/vault' },
        }),
      );
      expect(result.id).toBe('obsidian-src-001');
    });

    it('reconnects existing vault at the same path', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(mockObsidianSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockObsidianSource, status: SourceStatus.CONNECTED });

      const result = await service.registerObsidianVault(userId, '/data/vault');

      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: 'obsidian-src-001' },
        expect.objectContaining({ status: SourceStatus.CONNECTED }),
      );
      expect(result).toBeDefined();
    });

    it('creates a new vault source even when an existing source is at a different path', async () => {
      const differentVault = { ...mockObsidianSource, metadata: { path: '/other/vault', vaultPath: '/other/vault' } };
      mockSourceRepo.findFirst.mockResolvedValue(differentVault);
      mockSourceRepo.create.mockResolvedValue(mockObsidianSource);

      await service.registerObsidianVault(userId, '/data/vault');

      expect(mockSourceRepo.create).toHaveBeenCalled();
    });

    it('derives displayName from the vault path when not provided', async () => {
      mockSourceRepo.findFirst.mockResolvedValue(null);
      mockSourceRepo.create.mockResolvedValue(mockObsidianSource);

      await service.registerObsidianVault(userId, '/data/vault');

      expect(mockSourceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'vault' }),
      );
    });
  });
});
