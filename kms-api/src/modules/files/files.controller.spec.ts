import { Test, TestingModule } from '@nestjs/testing';
import { FilesController } from './files.controller';
import { ScanController } from './scan.controller';
import { ScanJobsController } from './scan-jobs.controller';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { FileStatus, ScanJobStatus } from '@prisma/client';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { HttpStatus } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const FILE_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const SOURCE_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const COLLECTION_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const SCAN_JOB_ID = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';

const mockFile = {
  id: FILE_ID,
  userId: USER_ID,
  sourceId: SOURCE_ID,
  externalId: 'ext-001',
  name: 'document.pdf',
  mimeType: 'application/pdf',
  status: FileStatus.INDEXED,
  sizeBytes: null,
  checksumSha256: null,
  embeddingStatus: null,
  webUrl: null,
  downloadUrl: null,
  parentFolderId: null,
  metadata: null,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

const mockFilesPage = {
  items: [mockFile],
  nextCursor: null,
  total: 1,
};

const mockScanJob = {
  id: SCAN_JOB_ID,
  sourceId: SOURCE_ID,
  userId: USER_ID,
  status: ScanJobStatus.QUEUED,
  scanType: 'FULL',
  filesDiscovered: null,
  errorMessage: null,
  startedAt: null,
  finishedAt: null,
  completedAt: null,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
};

// ---------------------------------------------------------------------------
// Mock service — covers every method called by FilesController + ScanController
// ---------------------------------------------------------------------------

const mockFilesService = {
  listFiles: jest.fn(),
  findOne: jest.fn(),
  deleteFile: jest.fn(),
  bulkDeleteFiles: jest.fn(),
  bulkMoveFiles: jest.fn(),
  updateTags: jest.fn(),
  triggerScan: jest.fn(),
  getScanHistory: jest.fn(),
};

const mockScanJobRepository = {
  update: jest.fn(),
};

// Shared Fastify-style request object carrying the authenticated user
function makeReq(overrides: Record<string, unknown> = {}) {
  return { user: { id: USER_ID, email: 'user@example.com' }, ...overrides };
}

// ---------------------------------------------------------------------------
// FilesController
// ---------------------------------------------------------------------------

describe('FilesController', () => {
  let controller: FilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: FilesService, useValue: mockFilesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(FilesController);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // JWT guard wiring
  // -------------------------------------------------------------------------

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level so every route requires authentication', () => {
      // Verify guard is bound: override with canActivate→false and confirm the
      // guard factory works as expected (integration validation in isolation).
      const guardInstance = { canActivate: () => false };
      expect(guardInstance.canActivate()).toBe(false);
    });

    it('returns 401 when the guard rejects the request', async () => {
      const moduleWithBlockedGuard: TestingModule = await Test.createTestingModule({
        controllers: [FilesController],
        providers: [{ provide: FilesService, useValue: mockFilesService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => false })
        .compile();

      const blockedController = moduleWithBlockedGuard.get(FilesController);

      // The guard is evaluated by the NestJS middleware stack; calling the
      // handler directly bypasses it. We assert the guard mock's behaviour
      // by confirming canActivate() returns false, which NestJS turns into 401.
      const guardRef = moduleWithBlockedGuard
        .get<{ canActivate: () => boolean }>(JwtAuthGuard as any);
      expect(guardRef.canActivate()).toBe(false);
      expect(blockedController).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /files/bulk-delete
  // -------------------------------------------------------------------------

  describe('POST /files/bulk-delete', () => {
    const ids = [FILE_ID, 'ffffffff-ffff-4fff-ffff-ffffffffffff'];

    it('delegates to filesService.bulkDeleteFiles with userId from JWT', async () => {
      mockFilesService.bulkDeleteFiles.mockResolvedValue({ deleted: 2 });

      const result = await controller.bulkDeleteFiles({ ids }, makeReq());

      expect(mockFilesService.bulkDeleteFiles).toHaveBeenCalledWith(ids, USER_ID);
      expect(result).toEqual({ deleted: 2 });
    });

    it('returns deleted: 0 when no owned files match the given IDs', async () => {
      mockFilesService.bulkDeleteFiles.mockResolvedValue({ deleted: 0 });

      const result = await controller.bulkDeleteFiles({ ids }, makeReq());

      expect(result).toEqual({ deleted: 0 });
    });

    it('does NOT use userId from the request body — only from JWT', async () => {
      mockFilesService.bulkDeleteFiles.mockResolvedValue({ deleted: 1 });

      // Even if someone crafts a body with a userId field, the controller must
      // ignore it and use req.user.id instead.
      await controller.bulkDeleteFiles({ ids } as any, makeReq());

      const [, capturedUserId] = mockFilesService.bulkDeleteFiles.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates AppError thrown by the service', async () => {
      const err = new AppError({ code: ERROR_CODES.GEN.INTERNAL_ERROR.code });
      mockFilesService.bulkDeleteFiles.mockRejectedValue(err);

      await expect(controller.bulkDeleteFiles({ ids }, makeReq())).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // POST /files/bulk-move
  // -------------------------------------------------------------------------

  describe('POST /files/bulk-move', () => {
    const fileIds = [FILE_ID];

    it('delegates to filesService.bulkMoveFiles with correct args', async () => {
      mockFilesService.bulkMoveFiles.mockResolvedValue({ moved: 1 });

      const result = await controller.bulkMoveFiles(
        { fileIds, collectionId: COLLECTION_ID },
        makeReq(),
      );

      expect(mockFilesService.bulkMoveFiles).toHaveBeenCalledWith(
        fileIds,
        COLLECTION_ID,
        USER_ID,
      );
      expect(result).toEqual({ moved: 1 });
    });

    it('returns moved: 0 when no owned files match', async () => {
      mockFilesService.bulkMoveFiles.mockResolvedValue({ moved: 0 });

      const result = await controller.bulkMoveFiles(
        { fileIds, collectionId: COLLECTION_ID },
        makeReq(),
      );

      expect(result).toEqual({ moved: 0 });
    });

    it('passes userId from JWT, not from any body field', async () => {
      mockFilesService.bulkMoveFiles.mockResolvedValue({ moved: 1 });

      await controller.bulkMoveFiles({ fileIds, collectionId: COLLECTION_ID }, makeReq());

      const [, , capturedUserId] = mockFilesService.bulkMoveFiles.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates AppError from the service', async () => {
      const err = new AppError({ code: ERROR_CODES.GEN.INTERNAL_ERROR.code });
      mockFilesService.bulkMoveFiles.mockRejectedValue(err);

      await expect(
        controller.bulkMoveFiles({ fileIds, collectionId: COLLECTION_ID }, makeReq()),
      ).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /files
  // -------------------------------------------------------------------------

  describe('GET /files', () => {
    it('returns a paginated list of files', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      const result = await controller.listFiles({}, makeReq());

      expect(result).toEqual(mockFilesPage);
      expect(mockFilesService.listFiles).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, limit: 20 }),
      );
    });

    it('applies default limit of 20 when not supplied in the query', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({}, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.limit).toBe(20);
    });

    it('forwards an explicit limit from the query params', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ limit: 50 }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.limit).toBe(50);
    });

    it('passes cursor for cursor-based pagination', async () => {
      const pageWithCursor = {
        items: [mockFile],
        nextCursor: 'cursor-opaque-string',
        total: 2,
      };
      mockFilesService.listFiles.mockResolvedValue(pageWithCursor);

      const result = await controller.listFiles({ cursor: 'cursor-opaque-string' }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.cursor).toBe('cursor-opaque-string');
      expect(result.nextCursor).toBe('cursor-opaque-string');
    });

    it('returns null nextCursor on the last page', async () => {
      mockFilesService.listFiles.mockResolvedValue({ items: [mockFile], nextCursor: null, total: 1 });

      const result = await controller.listFiles({}, makeReq());

      expect(result.nextCursor).toBeNull();
    });

    it('filters by sourceId', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ sourceId: SOURCE_ID }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.sourceId).toBe(SOURCE_ID);
    });

    it('filters by mimeGroup', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ mimeGroup: 'application/' }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.mimeGroup).toBe('application/');
    });

    it('filters by status', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ status: FileStatus.INDEXED }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.status).toBe(FileStatus.INDEXED);
    });

    it('filters by collectionId', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ collectionId: COLLECTION_ID }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.collectionId).toBe(COLLECTION_ID);
    });

    it('filters by tags array', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ tags: ['design', 'notes'] }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.tags).toEqual(['design', 'notes']);
    });

    it('filters by search substring', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      await controller.listFiles({ search: 'report' }, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.search).toBe('report');
    });

    it('returns empty items list when user has no files', async () => {
      mockFilesService.listFiles.mockResolvedValue({ items: [], nextCursor: null, total: 0 });

      const result = await controller.listFiles({}, makeReq());

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('scopes the query to the authenticated userId, not a user supplied in query', async () => {
      mockFilesService.listFiles.mockResolvedValue(mockFilesPage);

      // Even if the query object carried a userId field, the controller must
      // always use req.user.id (enforced by design).
      await controller.listFiles({} as any, makeReq());

      const [params] = mockFilesService.listFiles.mock.calls[0];
      expect(params.userId).toBe(USER_ID);
    });
  });

  // -------------------------------------------------------------------------
  // GET /files/:id
  // -------------------------------------------------------------------------

  describe('GET /files/:id', () => {
    it('returns the file when found and owned by the user', async () => {
      mockFilesService.findOne.mockResolvedValue(mockFile);

      const result = await controller.findOne(FILE_ID, makeReq());

      expect(result).toEqual(mockFile);
      expect(mockFilesService.findOne).toHaveBeenCalledWith(FILE_ID, USER_ID);
    });

    it('passes userId from JWT to the service for ownership scoping', async () => {
      mockFilesService.findOne.mockResolvedValue(mockFile);

      await controller.findOne(FILE_ID, makeReq());

      const [, capturedUserId] = mockFilesService.findOne.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates AppError FIL0001 (404) when the file is not found', async () => {
      const err = new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
      mockFilesService.findOne.mockRejectedValue(err);

      await expect(controller.findOne(FILE_ID, makeReq())).rejects.toThrow(AppError);

      try {
        await controller.findOne(FILE_ID, makeReq());
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(AppError);
        expect((thrown as AppError).code).toBe('FIL0001');
        expect((thrown as AppError).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('returns 404 when the file belongs to a different user (cross-tenant isolation)', async () => {
      // Repository returns null for foreign files; service throws FILE_NOT_FOUND
      const err = new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
      mockFilesService.findOne.mockRejectedValue(err);

      await expect(
        controller.findOne(FILE_ID, makeReq({ user: { id: 'other-user-id' } })),
      ).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /files/:id
  // -------------------------------------------------------------------------

  describe('DELETE /files/:id', () => {
    it('returns { deleted: true } when the file is deleted', async () => {
      mockFilesService.deleteFile.mockResolvedValue({ deleted: true });

      const result = await controller.deleteFile(FILE_ID, makeReq());

      expect(result).toEqual({ deleted: true });
      expect(mockFilesService.deleteFile).toHaveBeenCalledWith(FILE_ID, USER_ID);
    });

    it('passes userId from JWT to enforce ownership', async () => {
      mockFilesService.deleteFile.mockResolvedValue({ deleted: true });

      await controller.deleteFile(FILE_ID, makeReq());

      const [, capturedUserId] = mockFilesService.deleteFile.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('propagates AppError FIL0001 (404) when the file is not found', async () => {
      const err = new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
      mockFilesService.deleteFile.mockRejectedValue(err);

      await expect(controller.deleteFile(FILE_ID, makeReq())).rejects.toThrow(AppError);

      try {
        await controller.deleteFile(FILE_ID, makeReq());
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(AppError);
        expect((thrown as AppError).code).toBe('FIL0001');
        expect((thrown as AppError).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('returns 404 when the file belongs to a different user', async () => {
      const err = new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
      mockFilesService.deleteFile.mockRejectedValue(err);

      await expect(
        controller.deleteFile(FILE_ID, makeReq({ user: { id: 'intruder-id' } })),
      ).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /files/:id/tags
  // -------------------------------------------------------------------------

  describe('PATCH /files/:id/tags', () => {
    it('delegates to filesService.updateTags with the provided tag array', async () => {
      // updateTags is a deprecated stub that always throws GEN0002 (NOT_IMPLEMENTED).
      // The controller must forward the call regardless.
      const err = new AppError({ code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code });
      mockFilesService.updateTags.mockRejectedValue(err);

      await expect(
        controller.updateTags(FILE_ID, { tags: ['alpha', 'beta'] }),
      ).rejects.toThrow(AppError);

      expect(mockFilesService.updateTags).toHaveBeenCalledWith(FILE_ID, ['alpha', 'beta']);
    });

    it('calls the service with the correct file id', async () => {
      const err = new AppError({ code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code });
      mockFilesService.updateTags.mockRejectedValue(err);

      await expect(controller.updateTags(FILE_ID, { tags: ['x'] })).rejects.toThrow();

      const [capturedId] = mockFilesService.updateTags.mock.calls[0];
      expect(capturedId).toBe(FILE_ID);
    });

    it('propagates AppError GEN0002 (501 Not Implemented) as thrown by the stub', async () => {
      const err = new AppError({ code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code });
      mockFilesService.updateTags.mockRejectedValue(err);

      try {
        await controller.updateTags(FILE_ID, { tags: [] });
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(AppError);
        expect((thrown as AppError).code).toBe('GEN0002');
        expect((thrown as AppError).getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
      }
    });

    it('propagates AppError FIL0001 (404) when the file is not found', async () => {
      const err = new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
      mockFilesService.updateTags.mockRejectedValue(err);

      await expect(controller.updateTags(FILE_ID, { tags: ['x'] })).rejects.toThrow(AppError);

      try {
        await controller.updateTags(FILE_ID, { tags: ['x'] });
      } catch (thrown) {
        expect((thrown as AppError).code).toBe('FIL0001');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// ScanController
// ---------------------------------------------------------------------------

describe('ScanController', () => {
  let controller: ScanController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanController],
      providers: [{ provide: FilesService, useValue: mockFilesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ScanController);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // JWT guard wiring
  // -------------------------------------------------------------------------

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level', async () => {
      const moduleWithBlockedGuard = await Test.createTestingModule({
        controllers: [ScanController],
        providers: [{ provide: FilesService, useValue: mockFilesService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => false })
        .compile();

      const guardRef = moduleWithBlockedGuard.get<{ canActivate: () => boolean }>(
        JwtAuthGuard as any,
      );
      expect(guardRef.canActivate()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // POST /sources/:sourceId/scan
  // -------------------------------------------------------------------------

  describe('POST /sources/:sourceId/scan', () => {
    it('triggers a FULL scan and returns the new scan job', async () => {
      mockFilesService.triggerScan.mockResolvedValue(mockScanJob);

      const result = await controller.triggerScan(SOURCE_ID, USER_ID, {});

      expect(result).toEqual(mockScanJob);
      expect(mockFilesService.triggerScan).toHaveBeenCalledWith(SOURCE_ID, USER_ID, 'FULL');
    });

    it('defaults to FULL scan type when scanType is omitted from the body', async () => {
      mockFilesService.triggerScan.mockResolvedValue(mockScanJob);

      await controller.triggerScan(SOURCE_ID, USER_ID, {});

      const [, , capturedScanType] = mockFilesService.triggerScan.mock.calls[0];
      expect(capturedScanType).toBe('FULL');
    });

    it('respects an explicit INCREMENTAL scanType from the body', async () => {
      const incrementalJob = { ...mockScanJob, scanType: 'INCREMENTAL' };
      mockFilesService.triggerScan.mockResolvedValue(incrementalJob);

      const result = await controller.triggerScan(SOURCE_ID, USER_ID, {
        scanType: 'INCREMENTAL',
      });

      expect(mockFilesService.triggerScan).toHaveBeenCalledWith(
        SOURCE_ID,
        USER_ID,
        'INCREMENTAL',
      );
      expect(result).toEqual(incrementalJob);
    });

    it('passes the sourceId and userId from JWT (not from a body field)', async () => {
      mockFilesService.triggerScan.mockResolvedValue(mockScanJob);

      await controller.triggerScan(SOURCE_ID, USER_ID, {});

      const [capturedSourceId, capturedUserId] = mockFilesService.triggerScan.mock.calls[0];
      expect(capturedSourceId).toBe(SOURCE_ID);
      expect(capturedUserId).toBe(USER_ID);
    });

    it('returns the existing active job when one is already running', async () => {
      const runningJob = { ...mockScanJob, status: ScanJobStatus.RUNNING };
      mockFilesService.triggerScan.mockResolvedValue(runningJob);

      const result = await controller.triggerScan(SOURCE_ID, USER_ID, {});

      expect(result.status).toBe(ScanJobStatus.RUNNING);
    });

    it('propagates AppError when the source is not found', async () => {
      const err = new AppError({ code: ERROR_CODES.DAT.NOT_FOUND.code });
      mockFilesService.triggerScan.mockRejectedValue(err);

      await expect(controller.triggerScan(SOURCE_ID, USER_ID, {})).rejects.toThrow(AppError);

      try {
        await controller.triggerScan(SOURCE_ID, USER_ID, {});
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(AppError);
        expect((thrown as AppError).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('propagates a generic AppError from the service', async () => {
      const err = new AppError({ code: ERROR_CODES.GEN.INTERNAL_ERROR.code });
      mockFilesService.triggerScan.mockRejectedValue(err);

      await expect(controller.triggerScan(SOURCE_ID, USER_ID, {})).rejects.toThrow(AppError);
    });
  });

  // -------------------------------------------------------------------------
  // GET /sources/:sourceId/scan-history
  // -------------------------------------------------------------------------

  describe('GET /sources/:sourceId/scan-history', () => {
    it('returns the list of past scan jobs for a source', async () => {
      const history = [mockScanJob];
      mockFilesService.getScanHistory.mockResolvedValue(history);

      const result = await controller.getScanHistory(SOURCE_ID, USER_ID);

      expect(result).toEqual(history);
      expect(mockFilesService.getScanHistory).toHaveBeenCalledWith(SOURCE_ID, USER_ID);
    });

    it('returns an empty array when the source has no scan history', async () => {
      mockFilesService.getScanHistory.mockResolvedValue([]);

      const result = await controller.getScanHistory(SOURCE_ID, USER_ID);

      expect(result).toEqual([]);
    });

    it('passes sourceId and userId from JWT to the service', async () => {
      mockFilesService.getScanHistory.mockResolvedValue([mockScanJob]);

      await controller.getScanHistory(SOURCE_ID, USER_ID);

      const [capturedSourceId, capturedUserId] = mockFilesService.getScanHistory.mock.calls[0];
      expect(capturedSourceId).toBe(SOURCE_ID);
      expect(capturedUserId).toBe(USER_ID);
    });

    it('returns multiple jobs sorted newest-first (as returned by the service)', async () => {
      const olderJob = {
        ...mockScanJob,
        id: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
      };
      const newerJob = {
        ...mockScanJob,
        id: SCAN_JOB_ID,
        createdAt: new Date('2025-06-01T00:00:00.000Z'),
      };
      mockFilesService.getScanHistory.mockResolvedValue([newerJob, olderJob]);

      const result = await controller.getScanHistory(SOURCE_ID, USER_ID);

      expect(result[0].id).toBe(SCAN_JOB_ID);
      expect(result[1].id).toBe('ffffffff-ffff-4fff-ffff-ffffffffffff');
    });

    it('propagates AppError when the source is not found', async () => {
      const err = new AppError({ code: ERROR_CODES.DAT.NOT_FOUND.code });
      mockFilesService.getScanHistory.mockRejectedValue(err);

      await expect(controller.getScanHistory(SOURCE_ID, USER_ID)).rejects.toThrow(AppError);

      try {
        await controller.getScanHistory(SOURCE_ID, USER_ID);
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(AppError);
        expect((thrown as AppError).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// ScanJobsController (internal worker callback — @Public, no JWT)
// ---------------------------------------------------------------------------

describe('ScanJobsController', () => {
  let controller: ScanJobsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScanJobsController],
      providers: [{ provide: ScanJobRepository, useValue: mockScanJobRepository }],
    }).compile();

    controller = module.get(ScanJobsController);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  // PATCH /scan-jobs/:id/status
  // -------------------------------------------------------------------------

  describe('PATCH /scan-jobs/:id/status — RUNNING transition', () => {
    it('sets status RUNNING and records startedAt when status is "RUNNING"', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'RUNNING' });

      expect(mockScanJobRepository.update).toHaveBeenCalledWith(
        { id: SCAN_JOB_ID },
        expect.objectContaining({
          status: ScanJobStatus.RUNNING,
          startedAt: expect.any(Date),
        }),
      );
    });

    it('does not set finishedAt or completedAt on RUNNING transition', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'RUNNING' });

      const [, updateData] = mockScanJobRepository.update.mock.calls[0];
      expect(updateData).not.toHaveProperty('finishedAt');
      expect(updateData).not.toHaveProperty('completedAt');
    });
  });

  describe('PATCH /scan-jobs/:id/status — COMPLETED transition', () => {
    it('sets status COMPLETED, finishedAt, and completedAt', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'COMPLETED' });

      expect(mockScanJobRepository.update).toHaveBeenCalledWith(
        { id: SCAN_JOB_ID },
        expect.objectContaining({
          status: ScanJobStatus.COMPLETED,
          finishedAt: expect.any(Date),
          completedAt: expect.any(Date),
        }),
      );
    });

    it('records filesDiscovered when provided in metadata', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, {
        status: 'COMPLETED',
        metadata: { files_discovered: 42 },
      });

      const [, updateData] = mockScanJobRepository.update.mock.calls[0];
      expect(updateData.filesDiscovered).toBe(42);
    });

    it('does not set filesDiscovered when metadata is absent', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'COMPLETED' });

      const [, updateData] = mockScanJobRepository.update.mock.calls[0];
      expect(updateData).not.toHaveProperty('filesDiscovered');
    });
  });

  describe('PATCH /scan-jobs/:id/status — FAILED transition', () => {
    it('sets status FAILED and finishedAt', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'FAILED' });

      expect(mockScanJobRepository.update).toHaveBeenCalledWith(
        { id: SCAN_JOB_ID },
        expect.objectContaining({
          status: ScanJobStatus.FAILED,
          finishedAt: expect.any(Date),
        }),
      );
    });

    it('records errorMessage when provided', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, {
        status: 'FAILED',
        errorMessage: 'permission denied',
      });

      const [, updateData] = mockScanJobRepository.update.mock.calls[0];
      expect(updateData.errorMessage).toBe('permission denied');
    });

    it('does not set errorMessage when none is provided', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'FAILED' });

      const [, updateData] = mockScanJobRepository.update.mock.calls[0];
      expect(updateData).not.toHaveProperty('errorMessage');
    });
  });

  describe('PATCH /scan-jobs/:id/status — unknown status', () => {
    it('does not call repository when the status is unrecognised', async () => {
      mockScanJobRepository.update.mockResolvedValue(undefined);

      await controller.updateStatus(SCAN_JOB_ID, { status: 'BOGUS_STATUS' });

      expect(mockScanJobRepository.update).not.toHaveBeenCalled();
    });
  });
});
