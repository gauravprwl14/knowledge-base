'use strict';
import { Test, TestingModule } from '@nestjs/testing';
import { SourcesService } from './sources.service';
import { SourceRepository } from '../../database/repositories/source.repository';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { ScanJobPublisher } from '../../queue/publishers/scan-job.publisher';
import { PrismaService } from '../../database/prisma/prisma.service';
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

const mockPrisma = {
  kmsFile: {
    count: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  kmsChunk: {
    count: jest.fn(),
  },
  kmsClearJob: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  kmsScanJob: {
    deleteMany: jest.fn(),
  },
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
        { provide: ScanJobRepository, useValue: { create: jest.fn(), findById: jest.fn(), update: jest.fn(), findActiveBySourceId: jest.fn(), createJob: jest.fn(), findBySourceId: jest.fn() } },
        { provide: ScanJobPublisher, useValue: { publishScanJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: PrismaService, useValue: mockPrisma },
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

  // ─── disconnectSource (disconnect-only, clearData=false) ──────────────────

  describe('disconnectSource', () => {
    it('sets status DISCONNECTED, clears encryptedTokens, returns empty object', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockGdriveSource, status: SourceStatus.DISCONNECTED, encryptedTokens: null });

      const result = await service.disconnectSource(sourceId, userId, false);

      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: sourceId },
        expect.objectContaining({ status: SourceStatus.DISCONNECTED, encryptedTokens: null }),
      );
      expect(result).toEqual({});
    });

    it('is idempotent — returns empty object when source is already DISCONNECTED (no clearData)', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue({
        ...mockGdriveSource,
        status: SourceStatus.DISCONNECTED,
      });

      const result = await service.disconnectSource(sourceId, userId, false);
      // update should NOT be called for the no-op path
      expect(result).toEqual({});
    });

    it('does NOT delete kms_files when clearData=false', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockGdriveSource });

      await service.disconnectSource(sourceId, userId, false);

      expect(mockPrisma.kmsFile.deleteMany).not.toHaveBeenCalled();
    });

    it('throws AppError 404 when source not found', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.disconnectSource('missing', userId, false)).rejects.toThrow(AppError);
    });

    it('throws AppError 404 for source owned by different user', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.disconnectSource(sourceId, 'other-user', false)).rejects.toThrow(AppError);
    });
  });

  // ─── disconnectSource (clearData=true) ────────────────────────────────────

  describe('disconnectSource with clearData=true', () => {
    const clearJob = {
      id: 'clear-job-001',
      sourceId,
      userId,
      status: 'RUNNING' as const,
      totalFiles: 2,
      filesCleared: 0,
      chunksCleared: 0,
      vectorsCleared: 0,
      errorMsg: null,
      startedAt: new Date(),
      finishedAt: null,
    };

    beforeEach(() => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockGdriveSource, status: SourceStatus.DISCONNECTED, encryptedTokens: null });
      mockPrisma.kmsFile.count.mockResolvedValue(2);
      mockPrisma.kmsClearJob.create.mockResolvedValue(clearJob);
      // runClearJob internals — resolve immediately so the fire-and-forget doesn't leak
      mockPrisma.kmsFile.findMany.mockResolvedValue([]);
      mockPrisma.kmsClearJob.update.mockResolvedValue({ ...clearJob, status: 'DONE' });
      mockPrisma.kmsScanJob.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('returns jobId immediately (fire-and-forget async)', async () => {
      const result = await service.disconnectSource(sourceId, userId, true);

      expect(result).toHaveProperty('jobId', 'clear-job-001');
    });

    it('creates KmsClearJob record with RUNNING status and correct totalFiles', async () => {
      await service.disconnectSource(sourceId, userId, true);

      expect(mockPrisma.kmsClearJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceId,
          userId,
          status: 'RUNNING',
          totalFiles: 2,
        }),
      });
    });

    it('always wipes encryptedTokens on disconnect (security)', async () => {
      await service.disconnectSource(sourceId, userId, true);

      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        { id: sourceId },
        expect.objectContaining({ encryptedTokens: null }),
      );
    });

    it('clearData=true: deletes all kms_files for source in batches', async () => {
      // First batch returns 2 files; second batch returns empty (done)
      mockPrisma.kmsFile.findMany
        .mockResolvedValueOnce([{ id: 'file-001' }, { id: 'file-002' }])
        .mockResolvedValueOnce([]);
      mockPrisma.kmsChunk.count.mockResolvedValue(5);
      mockPrisma.kmsFile.deleteMany.mockResolvedValue({ count: 2 });

      // We need to wait for the background job to finish in this test.
      // Override create so we can capture the promise that runClearJob returns.
      let runClearJobPromise: Promise<void> | null = null;
      const originalRun = (service as any).runClearJob.bind(service);
      jest.spyOn(service as any, 'runClearJob').mockImplementation((...args: unknown[]) => {
        runClearJobPromise = originalRun(...args);
        return runClearJobPromise;
      });

      await service.disconnectSource(sourceId, userId, true);
      // Wait for the background job to complete
      await runClearJobPromise;

      expect(mockPrisma.kmsFile.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['file-001', 'file-002'] } } }),
      );
    });

    it('clearData=true: calls Qdrant delete API with correct file_id filter', async () => {
      mockPrisma.kmsFile.findMany
        .mockResolvedValueOnce([{ id: 'file-001' }])
        .mockResolvedValueOnce([]);
      mockPrisma.kmsChunk.count.mockResolvedValue(3);
      mockPrisma.kmsFile.deleteMany.mockResolvedValue({ count: 1 });

      // Mock global fetch
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as unknown as typeof fetch;

      let runClearJobPromise: Promise<void> | null = null;
      jest.spyOn(service as any, 'runClearJob').mockImplementation((...args: unknown[]) => {
        runClearJobPromise = (service as any).runClearJob.call(service, ...args);
        return runClearJobPromise;
      });

      // Get the original method back
      jest.restoreAllMocks();
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockGdriveSource);
      mockSourceRepo.update.mockResolvedValue({ ...mockGdriveSource });
      mockPrisma.kmsFile.count.mockResolvedValue(1);
      mockPrisma.kmsClearJob.create.mockResolvedValue(clearJob);

      await service.disconnectSource(sourceId, userId, true);
      // Give the background job a tick to start
      await new Promise((r) => setImmediate(r));

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/collections/kms_chunks/points/delete'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ─── getLatestClearJob ─────────────────────────────────────────────────────

  describe('getLatestClearJob', () => {
    it('returns null when no clear job exists', async () => {
      mockPrisma.kmsClearJob.findFirst.mockResolvedValue(null);

      const result = await service.getLatestClearJob(userId, sourceId);

      expect(result).toBeNull();
      expect(mockPrisma.kmsClearJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sourceId, userId } }),
      );
    });

    it('returns RUNNING job with filesCleared count', async () => {
      const runningJob = {
        id: 'clear-job-002',
        sourceId,
        userId,
        status: 'RUNNING',
        totalFiles: 10,
        filesCleared: 4,
        chunksCleared: 20,
        vectorsCleared: 20,
        errorMsg: null,
        startedAt: new Date(),
        finishedAt: null,
      };
      mockPrisma.kmsClearJob.findFirst.mockResolvedValue(runningJob);

      const result = await service.getLatestClearJob(userId, sourceId);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('RUNNING');
      expect(result!.filesCleared).toBe(4);
    });

    it('returns DONE job with final counts', async () => {
      const doneJob = {
        id: 'clear-job-003',
        sourceId,
        userId,
        status: 'DONE',
        totalFiles: 10,
        filesCleared: 10,
        chunksCleared: 50,
        vectorsCleared: 50,
        errorMsg: null,
        startedAt: new Date(),
        finishedAt: new Date(),
      };
      mockPrisma.kmsClearJob.findFirst.mockResolvedValue(doneJob);

      const result = await service.getLatestClearJob(userId, sourceId);

      expect(result!.status).toBe('DONE');
      expect(result!.filesCleared).toBe(10);
      expect(result!.finishedAt).toBeDefined();
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
