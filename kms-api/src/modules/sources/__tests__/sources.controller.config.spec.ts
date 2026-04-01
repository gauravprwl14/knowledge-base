'use strict';
/**
 * Unit tests for new sources endpoints:
 * - PATCH /sources/:id/config  (SourcesService.updateConfig)
 * - GET   /sources/google-drive/folders  (SourcesService.listDriveFolders)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { SourcesService } from '../sources.service';
import { SourceRepository } from '../../../database/repositories/source.repository';
import { ScanJobRepository } from '../../../database/repositories/scan-job.repository';
import { ScanJobPublisher } from '../../../queue/publishers/scan-job.publisher';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import { AppError } from '../../../errors/types/app-error';
import { getLoggerToken } from 'nestjs-pino';
import { SourceType, SourceStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Top-level googleapis mock (must be top-level — jest.mock is hoisted)
// ---------------------------------------------------------------------------

const mockFilesList = jest.fn();
const mockSetCredentials = jest.fn();
const mockGenerateAuthUrl = jest.fn().mockReturnValue('https://accounts.google.com/auth');
const mockGetToken = jest.fn();
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
        about: { get: (...args: unknown[]) => mockDriveAboutGet(...args) },
        files: {
          list: (...args: unknown[]) => mockFilesList(...args),
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
  debug: jest.fn(),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userId = 'user-uuid-001';
const sourceId = 'src-uuid-001';
const otherUserId = 'other-user-002';

const baseSource = {
  id: sourceId,
  userId,
  type: SourceType.GOOGLE_DRIVE,
  status: SourceStatus.CONNECTED,
  name: 'user@example.com',
  displayName: 'user@example.com',
  externalId: null,
  encryptedTokens: 'encrypted-tokens',
  configJson: null,
  metadata: null,
  lastSyncedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('SourcesService — updateConfig', () => {
  let service: SourcesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourcesService,
        { provide: SourceRepository, useValue: mockSourceRepo },
        { provide: ScanJobRepository, useValue: { create: jest.fn(), findById: jest.fn(), update: jest.fn(), findActiveBySourceId: jest.fn(), createJob: jest.fn(), findBySourceId: jest.fn() } },
        { provide: ScanJobPublisher, useValue: { publishScanJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: PrismaService, useValue: { kmsFile: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() }, kmsChunk: { count: jest.fn() }, kmsClearJob: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() }, kmsScanJob: { deleteMany: jest.fn() } } },
        { provide: TokenEncryptionService, useValue: mockTokenEncryption },
        { provide: getLoggerToken(SourcesService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SourcesService>(SourcesService);
  });

  it('should update syncFolderIds in configJson', async () => {
    const updatedSource = { ...baseSource, configJson: { syncFolderIds: ['folder-1'] } };
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(baseSource);
    mockSourceRepo.update.mockResolvedValue(updatedSource);

    const result = await service.updateConfig(userId, sourceId, { syncFolderIds: ['folder-1'] });

    expect(mockSourceRepo.update).toHaveBeenCalledWith(
      { id: sourceId },
      { configJson: { syncFolderIds: ['folder-1'] } },
    );
    expect(result.id).toBe(sourceId);
  });

  it('should update transcribeVideos flag', async () => {
    const updatedSource = { ...baseSource, configJson: { transcribeVideos: true } };
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(baseSource);
    mockSourceRepo.update.mockResolvedValue(updatedSource);

    await service.updateConfig(userId, sourceId, { transcribeVideos: true });

    expect(mockSourceRepo.update).toHaveBeenCalledWith(
      { id: sourceId },
      { configJson: { transcribeVideos: true } },
    );
  });

  it('should return 404 for source belonging to a different user', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);

    await expect(service.updateConfig(otherUserId, sourceId, { syncFolderIds: [] })).rejects.toThrow(AppError);
  });

  it('should merge new config fields into existing configJson (not replace)', async () => {
    const existingSource = {
      ...baseSource,
      configJson: { syncFolderIds: ['old-folder'], transcribeVideos: false },
    };
    const expectedMerged = {
      syncFolderIds: ['new-folder'],
      transcribeVideos: false,
      includeExtensions: ['.pdf'],
    };
    const updatedSource = { ...baseSource, configJson: expectedMerged };
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(existingSource);
    mockSourceRepo.update.mockResolvedValue(updatedSource);

    await service.updateConfig(userId, sourceId, {
      syncFolderIds: ['new-folder'],
      includeExtensions: ['.pdf'],
    });

    expect(mockSourceRepo.update).toHaveBeenCalledWith(
      { id: sourceId },
      { configJson: expectedMerged },
    );
  });

  it('should handle null existing configJson as empty object', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue({ ...baseSource, configJson: null });
    mockSourceRepo.update.mockResolvedValue({ ...baseSource, configJson: { syncFolderIds: ['f1'] } });

    await service.updateConfig(userId, sourceId, { syncFolderIds: ['f1'] });

    expect(mockSourceRepo.update).toHaveBeenCalledWith(
      { id: sourceId },
      { configJson: { syncFolderIds: ['f1'] } },
    );
  });
});

// ---------------------------------------------------------------------------
// listDriveFolders tests
// ---------------------------------------------------------------------------

describe('SourcesService — listDriveFolders', () => {
  let service: SourcesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourcesService,
        { provide: SourceRepository, useValue: mockSourceRepo },
        { provide: ScanJobRepository, useValue: { create: jest.fn(), findById: jest.fn(), update: jest.fn(), findActiveBySourceId: jest.fn(), createJob: jest.fn(), findBySourceId: jest.fn() } },
        { provide: ScanJobPublisher, useValue: { publishScanJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: PrismaService, useValue: { kmsFile: { count: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() }, kmsChunk: { count: jest.fn() }, kmsClearJob: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() }, kmsScanJob: { deleteMany: jest.fn() } } },
        { provide: TokenEncryptionService, useValue: mockTokenEncryption },
        { provide: getLoggerToken(SourcesService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<SourcesService>(SourcesService);
  });

  it('should return folder list from Drive API', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(baseSource);
    mockFilesList.mockReturnValue({
      execute: jest.fn().mockResolvedValue({
        data: {
          files: [
            { id: 'folder-a', name: 'Work' },
            { id: 'folder-b', name: 'Personal' },
          ],
        },
      }),
    });

    // Drive mock returns files list through google.drive().files.list()
    // The service uses drive.files.list(...) — mock the entire chain
    const { google } = jest.requireMock('googleapis');
    google.drive.mockReturnValue({
      about: { get: mockDriveAboutGet },
      files: {
        list: jest.fn().mockReturnValue({
          data: { files: [{ id: 'folder-a', name: 'Work' }, { id: 'folder-b', name: 'Personal' }] },
        }),
      },
    });

    const result = await service.listDriveFolders(userId, sourceId, 'root');

    expect(result.folders).toHaveLength(2);
    expect(result.folders[0]).toMatchObject({ id: 'folder-a', name: 'Work', path: 'Work', childCount: 0 });
  });

  it('should return 404 if source not found', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);

    await expect(service.listDriveFolders(userId, sourceId, 'root')).rejects.toThrow(AppError);
  });

  it('should return 404 if source has no encrypted tokens', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue({ ...baseSource, encryptedTokens: null });

    await expect(service.listDriveFolders(userId, sourceId, 'root')).rejects.toThrow(AppError);
  });

  it('should handle empty folder list gracefully', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(baseSource);
    const { google } = jest.requireMock('googleapis');
    google.drive.mockReturnValue({
      about: { get: mockDriveAboutGet },
      files: {
        list: jest.fn().mockReturnValue({ data: { files: [] } }),
      },
    });

    const result = await service.listDriveFolders(userId, sourceId, 'root');

    expect(result.folders).toHaveLength(0);
  });

  it('should use non-root parentId in folder paths', async () => {
    mockSourceRepo.findByIdAndUserId.mockResolvedValue(baseSource);
    const { google } = jest.requireMock('googleapis');
    google.drive.mockReturnValue({
      about: { get: mockDriveAboutGet },
      files: {
        list: jest.fn().mockReturnValue({
          data: { files: [{ id: 'sub-folder', name: 'SubFolder' }] },
        }),
      },
    });

    const result = await service.listDriveFolders(userId, sourceId, 'parent-folder-id');

    expect(result.folders[0].path).toBe('parent-folder-id/SubFolder');
  });
});
