import { Test, TestingModule } from '@nestjs/testing';
import { SourcesService } from './sources.service';
import { SourceRepository } from '../../database/repositories/source.repository';
import { TokenEncryptionService } from './token-encryption.service';
import { AppError } from '../../errors/types/app-error';
import { getLoggerToken } from 'nestjs-pino';
import { SourceType, SourceStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSourceRepo = {
  findByUserId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
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

const mockSource = {
  id: sourceId,
  userId,
  type: SourceType.GOOGLE_DRIVE,
  status: SourceStatus.ACTIVE,
  displayName: 'My Drive',
  externalId: 'gdrive-user@example.com',
  encryptedTokens: 'encrypted-tokens',
  configJson: null,
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
    // Mock google auth client constructor
    jest.mock('googleapis', () => ({
      google: {
        auth: {
          OAuth2: jest.fn().mockImplementation(() => ({
            generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/oauth'),
            getToken: jest.fn(),
          })),
        },
      },
    }));

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

  describe('listSources', () => {
    it('returns all sources for a user without sensitive fields', async () => {
      mockSourceRepo.findByUserId.mockResolvedValue([mockSource]);

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

  describe('getSource', () => {
    it('returns the source when found and owned by user', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockSource);

      const result = await service.getSource(sourceId, userId);
      expect(result.id).toBe(sourceId);
    });

    it('throws AppError 404 when source is not found or belongs to another user', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.getSource('wrong-id', userId)).rejects.toThrow(AppError);
    });
  });

  describe('disconnectSource', () => {
    it('updates source status to DISCONNECTED', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(mockSource);
      mockSourceRepo.update.mockResolvedValue({
        ...mockSource,
        status: SourceStatus.DISCONNECTED,
      });

      const result = await service.disconnectSource(sourceId, userId);
      expect(result.status).toBe(SourceStatus.DISCONNECTED);
      expect(mockSourceRepo.update).toHaveBeenCalledWith(
        sourceId,
        expect.objectContaining({ status: SourceStatus.DISCONNECTED }),
      );
    });

    it('throws AppError when source not found before disconnecting', async () => {
      mockSourceRepo.findByIdAndUserId.mockResolvedValue(null);
      await expect(service.disconnectSource('missing', userId)).rejects.toThrow(AppError);
    });
  });

  describe('handleGoogleCallback', () => {
    it('throws AppError when code is missing', async () => {
      await expect(service.handleGoogleCallback('', userId)).rejects.toThrow(AppError);
    });

    it('throws AppError when userId is missing', async () => {
      await expect(service.handleGoogleCallback('valid-code', '')).rejects.toThrow(AppError);
    });
  });
});
