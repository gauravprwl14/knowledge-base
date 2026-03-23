/**
 * Unit tests for FilesService.getTranscription()
 *
 * Covers:
 * - Returns null when no voice job exists for the file
 * - Returns PENDING job status when job exists
 * - Returns COMPLETED job with language populated
 * - Scopes by userId — returns null for file belonging to a different user
 * - FAILED status with error message
 * - Response shape uses camelCase (mapped from snake_case DB columns)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FilesService } from '../files.service';
import { FileRepository } from '../../../database/repositories/file.repository';
import { ScanJobRepository } from '../../../database/repositories/scan-job.repository';
import { AppLogger } from '../../../logger/logger.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../../queue/publishers/embed-job.publisher';
import { ScanJobPublisher } from '../../../queue/publishers/scan-job.publisher';

// ---------------------------------------------------------------------------
// Helpers — raw row shapes as returned by $queryRaw (snake_case column names)
// ---------------------------------------------------------------------------

function makeVoiceRow(overrides: Record<string, unknown> = {}): object {
  return {
    id: 'job-001',
    status: 'PENDING',
    language: null,
    duration_seconds: null,
    completed_at: null,
    error_msg: null,
    model_used: null,
    created_at: new Date('2026-03-22T00:00:00Z'),
    updated_at: new Date('2026-03-22T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('FilesService.getTranscription()', () => {
  let service: FilesService;

  // $queryRaw mock — returns an array of raw rows
  const prismaQueryRaw = jest.fn();
  const prismaKmsSourceFindFirst = jest.fn();
  const prismaKmsFileCreate = jest.fn();

  const mockPrisma = {
    $queryRaw: prismaQueryRaw,
    kmsSource: {
      findFirst: prismaKmsSourceFindFirst,
      create: jest.fn(),
    },
    kmsFile: { create: prismaKmsFileCreate },
  };

  const mockFileRepo = {
    listFiles: jest.fn(),
    findByIdAndUserId: jest.fn(),
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
        { provide: EmbedJobPublisher, useValue: { publishEmbedJob: jest.fn().mockResolvedValue(undefined) } },
        { provide: ScanJobRepository, useValue: mockScanJobRepo },
        { provide: ScanJobPublisher, useValue: { publishScanJob: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  // -------------------------------------------------------------------------
  // Null when no job exists
  // -------------------------------------------------------------------------

  it('returns null when no voice job exists for the file', async () => {
    prismaQueryRaw.mockResolvedValue([]);

    const result = await service.getTranscription('user-001', 'file-001');

    expect(result).toBeNull();
    expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // PENDING status
  // -------------------------------------------------------------------------

  it('returns PENDING job status when transcription is queued', async () => {
    const pendingRow = makeVoiceRow({ status: 'PENDING' });
    prismaQueryRaw.mockResolvedValue([pendingRow]);

    const result = await service.getTranscription('user-001', 'file-001') as any;

    expect(result).not.toBeNull();
    expect(result.status).toBe('PENDING');
    expect(result.id).toBe('job-001');
  });

  // -------------------------------------------------------------------------
  // COMPLETED status with language and duration
  // -------------------------------------------------------------------------

  it('returns COMPLETED job with camelCase fields mapped from snake_case columns', async () => {
    const completedRow = makeVoiceRow({
      status: 'COMPLETED',
      language: 'en',
      duration_seconds: 120.5,
      completed_at: new Date('2026-03-22T01:00:00Z'),
      model_used: 'base',
    });
    prismaQueryRaw.mockResolvedValue([completedRow]);

    const result = await service.getTranscription('user-001', 'file-001') as any;

    expect(result.status).toBe('COMPLETED');
    expect(result.language).toBe('en');
    expect(result.durationSeconds).toBeCloseTo(120.5);
    expect(result.completedAt).toEqual(new Date('2026-03-22T01:00:00Z'));
    expect(result.modelUsed).toBe('base');
    // Confirm raw snake_case keys are NOT exposed directly
    expect(result).not.toHaveProperty('duration_seconds');
    expect(result).not.toHaveProperty('model_used');
  });

  // -------------------------------------------------------------------------
  // FAILED status with error message
  // -------------------------------------------------------------------------

  it('returns FAILED job with errorMsg when transcription failed', async () => {
    const failedRow = makeVoiceRow({
      status: 'FAILED',
      error_msg: 'Audio file is corrupt',
    });
    prismaQueryRaw.mockResolvedValue([failedRow]);

    const result = await service.getTranscription('user-001', 'file-001') as any;

    expect(result.status).toBe('FAILED');
    expect(result.errorMsg).toBe('Audio file is corrupt');
  });

  // -------------------------------------------------------------------------
  // Multi-tenant isolation — different user sees null
  // -------------------------------------------------------------------------

  it('returns null for a file belonging to a different user', async () => {
    // $queryRaw returns empty array when user_id filter finds no match
    prismaQueryRaw.mockResolvedValue([]);

    const result = await service.getTranscription('other-user', 'file-001');

    expect(result).toBeNull();
    // $queryRaw should still be called (filter is in the SQL itself)
    expect(prismaQueryRaw).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Null fields remain null in the response
  // -------------------------------------------------------------------------

  it('preserves null for optional fields when job is still PENDING', async () => {
    const pendingRow = makeVoiceRow({ status: 'PENDING' });
    prismaQueryRaw.mockResolvedValue([pendingRow]);

    const result = await service.getTranscription('user-001', 'file-001') as any;

    expect(result.language).toBeNull();
    expect(result.durationSeconds).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.errorMsg).toBeNull();
    expect(result.modelUsed).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Response includes timestamps
  // -------------------------------------------------------------------------

  it('includes createdAt and updatedAt in the response', async () => {
    const row = makeVoiceRow({ status: 'PENDING' });
    prismaQueryRaw.mockResolvedValue([row]);

    const result = await service.getTranscription('user-001', 'file-001') as any;

    expect(result.createdAt).toEqual(new Date('2026-03-22T00:00:00Z'));
    expect(result.updatedAt).toEqual(new Date('2026-03-22T00:00:00Z'));
  });
});
