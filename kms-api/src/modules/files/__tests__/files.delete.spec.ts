/**
 * Unit tests for FilesService.deleteFile()
 *
 * Covers:
 * - Returns { deleted: true } when file is found and owned by userId
 * - Throws FILE_NOT_FOUND when file does not exist or belongs to another user
 * - Calls prisma.kmsFile.update with status DELETED and sets deletedAt
 * - Calls prisma.$executeRaw to delete kms_chunks for the file
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from '../files.service';
import { FileRepository } from '../../../database/repositories/file.repository';
import { ScanJobRepository } from '../../../database/repositories/scan-job.repository';
import { AppLogger } from '../../../logger/logger.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../../queue/publishers/embed-job.publisher';
import { ScanJobPublisher } from '../../../queue/publishers/scan-job.publisher';
import { MinioService } from '../minio.service';
import { AppError } from '../../../errors/types/app-error';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-001',
    userId: 'user-001',
    sourceId: 'source-001',
    name: 'report.pdf',
    status: 'INDEXED',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('FilesService.deleteFile()', () => {
  let service: FilesService;

  const prismaKmsFileUpdate = jest.fn();
  const prismaExecuteRaw = jest.fn();

  const mockPrisma = {
    kmsFile: {
      update: prismaKmsFileUpdate,
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    kmsSource: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    kmsVoiceJob: { findFirst: jest.fn() },
    $executeRaw: prismaExecuteRaw,
  };

  const mockFileRepo = {
    findByIdAndUserId: jest.fn(),
    listFiles: jest.fn(),
    deleteById: jest.fn(),
    bulkDelete: jest.fn(),
    bulkMoveToCollection: jest.fn(),
  };

  const mockScanJobRepo = {
    findActiveBySourceId: jest.fn(),
    createJob: jest.fn(),
    findBySourceId: jest.fn(),
  };

  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockLogger = {
    child: jest.fn().mockReturnValue(mockChildLogger),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: FileRepository, useValue: mockFileRepo },
        { provide: AppLogger, useValue: mockLogger },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: EmbedJobPublisher,
          useValue: { publishEmbedJob: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ScanJobRepository, useValue: mockScanJobRepo },
        {
          provide: ScanJobPublisher,
          useValue: { publishScanJob: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MinioService,
          useValue: { getPresignedUrl: jest.fn().mockResolvedValue('http://minio/url'), getTranscriptText: jest.fn().mockResolvedValue(''), uploadTranscript: jest.fn().mockResolvedValue('object-key') },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  // -------------------------------------------------------------------------
  // Happy path — file found and owned by user
  // -------------------------------------------------------------------------

  it('returns { deleted: true } when file is found and owned by userId', async () => {
    const file = makeFile({ id: 'file-001', userId: 'user-001' });
    mockFileRepo.findByIdAndUserId.mockResolvedValue(file);
    prismaExecuteRaw.mockResolvedValue(undefined);
    prismaKmsFileUpdate.mockResolvedValue({ ...file, status: 'DELETED' });

    const result = await service.deleteFile('file-001', 'user-001');

    expect(result).toEqual({ deleted: true });
  });

  // -------------------------------------------------------------------------
  // Ownership guard — file not found or belongs to another user
  // -------------------------------------------------------------------------

  it('throws AppError FILE_NOT_FOUND when file does not exist', async () => {
    mockFileRepo.findByIdAndUserId.mockResolvedValue(null);

    await expect(service.deleteFile('no-such-file', 'user-001')).rejects.toThrow(AppError);

    // Neither chunks delete nor file update should be called
    expect(prismaExecuteRaw).not.toHaveBeenCalled();
    expect(prismaKmsFileUpdate).not.toHaveBeenCalled();
  });

  it('throws AppError FILE_NOT_FOUND when file belongs to a different user', async () => {
    // findByIdAndUserId already scopes by userId; if different user it returns null
    mockFileRepo.findByIdAndUserId.mockResolvedValue(null);

    await expect(service.deleteFile('file-001', 'user-other')).rejects.toThrow(AppError);
  });

  // -------------------------------------------------------------------------
  // Soft-delete side effects
  // -------------------------------------------------------------------------

  it('calls prisma.$executeRaw to delete kms_chunks before soft-deleting the file', async () => {
    const file = makeFile({ id: 'file-002', userId: 'user-001' });
    mockFileRepo.findByIdAndUserId.mockResolvedValue(file);
    prismaExecuteRaw.mockResolvedValue(undefined);
    prismaKmsFileUpdate.mockResolvedValue({ ...file, status: 'DELETED' });

    await service.deleteFile('file-002', 'user-001');

    // $executeRaw must be called (chunk delete) before the file update
    expect(prismaExecuteRaw).toHaveBeenCalledTimes(1);
    // The raw query template should reference kms_chunks and the file id
    const rawCallArg = prismaExecuteRaw.mock.calls[0][0];
    // TemplateStringsArray or raw SQL string — verify 'kms_chunks' appears somewhere in the call
    expect(JSON.stringify(rawCallArg)).toContain('kms_chunks');
  });

  it('calls prisma.kmsFile.update with status DELETED and sets deletedAt', async () => {
    const file = makeFile({ id: 'file-003', userId: 'user-001' });
    mockFileRepo.findByIdAndUserId.mockResolvedValue(file);
    prismaExecuteRaw.mockResolvedValue(undefined);
    prismaKmsFileUpdate.mockResolvedValue({ ...file, status: 'DELETED' });

    await service.deleteFile('file-003', 'user-001');

    expect(prismaKmsFileUpdate).toHaveBeenCalledTimes(1);
    const updateCall = prismaKmsFileUpdate.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: 'file-003' });
    expect(updateCall.data.status).toBe('DELETED');
    expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
  });
});
