import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getLoggerToken } from 'nestjs-pino';
import { ContentPiecesService } from './content-pieces.service';
import { ContentJobPublisher } from './content-job.publisher';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { ContentSourceType } from '@prisma/client';
import { UpdateContentPieceDto } from './dto/update-content-piece.dto';
import { GenerateVariationDto } from './dto/generate-variation.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock ContentPiece record with sensible defaults.
 */
function makePiece(overrides: Record<string, unknown> = {}) {
  return {
    id: 'piece-001',
    jobId: 'job-001',
    userId: 'user-001',
    platform: 'linkedin',
    format: 'post',
    variationIndex: 0,
    content: 'My LinkedIn post content.',
    status: 'draft',
    isActive: true,
    version: 1,
    metadata: {},
    editedAt: null,
    publishedAt: null,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    updatedAt: new Date('2026-01-01T12:00:00.000Z'),
    // Include a nested job relation with userId for ownership checks
    job: { userId: 'user-001' },
    ...overrides,
  };
}

/**
 * Creates a mock ContentJob record for ownership verification.
 */
function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-001',
    userId: 'user-001',
    sourceType: ContentSourceType.YOUTUBE,
    configSnapshot: { linkedin: { enabled: true } },
    voiceBriefText: 'My voice.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('ContentPiecesService', () => {
  let service: ContentPiecesService;
  // Holds the compiled TestingModule — created once in beforeAll and closed in afterAll.
  let module: TestingModule;

  // --- PrismaService mocks ---
  const prismaContentJobFindUnique = jest.fn();
  const prismaContentPieceFindUnique = jest.fn();
  const prismaContentPieceFindFirst = jest.fn();
  const prismaContentPieceFindUniqueOrThrow = jest.fn();
  const prismaContentPieceFindMany = jest.fn();
  const prismaContentPieceCount = jest.fn();
  const prismaContentPieceUpdate = jest.fn();
  const prismaContentPieceUpdateMany = jest.fn();
  const prismaTransaction = jest.fn();

  const mockPrisma = {
    contentJob: {
      findUnique: prismaContentJobFindUnique,
    },
    contentPiece: {
      findUnique: prismaContentPieceFindUnique,
      findFirst: prismaContentPieceFindFirst,
      findUniqueOrThrow: prismaContentPieceFindUniqueOrThrow,
      findMany: prismaContentPieceFindMany,
      count: prismaContentPieceCount,
      update: prismaContentPieceUpdate,
      updateMany: prismaContentPieceUpdateMany,
    },
    $transaction: prismaTransaction,
  };

  // --- ContentJobPublisher mock ---
  const mockPublishContentJob = jest.fn().mockResolvedValue(undefined);
  const mockPublisher = { publishContentJob: mockPublishContentJob };

  // --- PinoLogger mock ---
  // Uses the nestjs-pino injection token pattern: `PinoLogger:<ClassName>`.
  // `getLoggerToken(ClassName.name)` produces the same token that
  // `@InjectPinoLogger(ClassName.name)` resolves, so the DI container finds
  // the mock without needing the real nestjs-pino module wired up.
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  // Create the NestJS TestingModule ONCE per describe block to avoid creating
  // a new module (and associated async resources) for every test.
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ContentPiecesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ContentJobPublisher, useValue: mockPublisher },
        { provide: getLoggerToken(ContentPiecesService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ContentPiecesService>(ContentPiecesService);
  });

  // Release module resources after all tests complete.
  afterAll(async () => {
    await module.close();
  });

  beforeEach(() => {
    // Clear mock call counts and per-test return values between tests.
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // updatePiece()
  //
  // The implementation uses a single atomic `updateMany` with `version` in the
  // WHERE clause, followed by `findUniqueOrThrow` to return the updated row.
  // On count=0 it calls `findFirst` to distinguish not-found from stale-version.
  // -------------------------------------------------------------------------

  describe('updatePiece()', () => {
    it('happy path — updateMany returns count=1 and updated piece is returned', async () => {
      // Arrange: the atomic write succeeds (1 row matched and updated)
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 1 });
      const updatedPiece = makePiece({ content: 'New content', version: 2, editedAt: new Date() });
      // After the write, the service fetches the fresh record via findUniqueOrThrow
      prismaContentPieceFindUniqueOrThrow.mockResolvedValue(updatedPiece);

      const dto: UpdateContentPieceDto = { content: 'New content', version: 1 };
      const result = await service.updatePiece('piece-001', dto, 'user-001');

      // The atomic update must include version and pieceId in WHERE clause
      expect(prismaContentPieceUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'piece-001',
            version: 1,
          }),
          data: expect.objectContaining({
            content: 'New content',
            editedAt: expect.any(Date),
          }),
        }),
      );
      // findUniqueOrThrow is called to return the updated row (updateMany doesn't return rows)
      expect(prismaContentPieceFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'piece-001' },
      });
      expect(result.content).toBe('New content');
    });

    it('version increment — WHERE uses dto.version and data uses { increment: 1 }', async () => {
      // Arrange: piece at version 3, client sends version 3
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 1 });
      prismaContentPieceFindUniqueOrThrow.mockResolvedValue(makePiece({ version: 4 }));

      const dto: UpdateContentPieceDto = { content: 'Updated', version: 3 };
      await service.updatePiece('piece-001', dto, 'user-001');

      expect(prismaContentPieceUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ version: 3 }),
          // Prisma atomic increment operator — not a hardcoded number
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
    });

    it('version conflict — updateMany count=0, findFirst returns piece with current version, throws KBCNT0013 (409)', async () => {
      // Arrange: stale-version write returns 0 rows; follow-up read finds piece
      // owned by this user with the actual current version (5)
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 0 });
      prismaContentPieceFindFirst.mockResolvedValue({ id: 'piece-001', version: 5 });

      const dto: UpdateContentPieceDto = { content: 'Stale update', version: 3 };

      await expect(service.updatePiece('piece-001', dto, 'user-001')).rejects.toBeInstanceOf(
        AppError,
      );

      try {
        await service.updatePiece('piece-001', dto, 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.PIECE_VERSION_CONFLICT.code);
        // HTTP status must be 409
        expect((err as AppError).getStatus()).toBe(409);
      }

      // findUniqueOrThrow must NOT be called when the update returns 0 rows
      expect(prismaContentPieceFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('not found — updateMany count=0, findFirst returns null, throws KBCNT0005 (404)', async () => {
      // Arrange: neither the write nor the disambiguating read finds the piece
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 0 });
      prismaContentPieceFindFirst.mockResolvedValue(null);

      const dto: UpdateContentPieceDto = { content: 'Content', version: 1 };

      await expect(
        service.updatePiece('missing-piece', dto, 'user-001'),
      ).rejects.toBeInstanceOf(AppError);

      try {
        await service.updatePiece('missing-piece', dto, 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.PIECE_NOT_FOUND.code);
        expect((err as AppError).getStatus()).toBe(404);
      }

      expect(prismaContentPieceFindUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('cross-user IDOR — updateMany count=0 (userId mismatch in WHERE), findFirst returns null, throws 404 (no info leak)', async () => {
      // The IDOR case: piece exists but belongs to another user's job. The
      // WHERE clause (job: { userId }) filters it out so both the atomic write
      // and the follow-up findFirst return nothing — same 404 as genuine not-found.
      // This prevents information leakage about whether the piece exists at all.
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 0 });
      prismaContentPieceFindFirst.mockResolvedValue(null);

      const dto: UpdateContentPieceDto = { content: 'Hack attempt', version: 1 };

      await expect(service.updatePiece('piece-001', dto, 'user-999')).rejects.toBeInstanceOf(
        AppError,
      );

      try {
        await service.updatePiece('piece-001', dto, 'user-999');
      } catch (err) {
        // Must NOT expose that the piece exists — always 404 for IDOR attempts
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.PIECE_NOT_FOUND.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // setActiveVariation()
  // -------------------------------------------------------------------------

  describe('setActiveVariation()', () => {
    it('sets is_active=true on the target piece', async () => {
      const piece = makePiece({ isActive: false });
      prismaContentPieceFindUnique.mockResolvedValue(piece);
      // $transaction receives an array of Prisma operations — mock it to resolve
      prismaTransaction.mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 1 });
      prismaContentPieceUpdate.mockResolvedValue({ ...piece, isActive: true });

      await service.setActiveVariation('piece-001', 'job-001', 'user-001');

      // The second operation in the transaction activates the target piece
      expect(prismaContentPieceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'piece-001' },
          data: { isActive: true },
        }),
      );
    });

    it('sets is_active=false on ALL other same-platform pieces first', async () => {
      const piece = makePiece();
      prismaContentPieceFindUnique.mockResolvedValue(piece);
      prismaTransaction.mockImplementation(async (ops: Promise<unknown>[]) =>
        Promise.all(ops),
      );
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 3 });
      prismaContentPieceUpdate.mockResolvedValue({ ...piece, isActive: true });

      await service.setActiveVariation('piece-001', 'job-001', 'user-001');

      // The first operation deactivates all pieces for the same platform+format
      expect(prismaContentPieceUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            jobId: 'job-001',
            platform: 'linkedin',
            format: 'post',
          }),
          data: { isActive: false },
        }),
      );
    });

    it('performs the swap atomically in a single prisma.$transaction call', async () => {
      const piece = makePiece();
      prismaContentPieceFindUnique.mockResolvedValue(piece);
      prismaTransaction.mockResolvedValue([{ count: 1 }, piece]);
      prismaContentPieceUpdateMany.mockResolvedValue({ count: 1 });
      prismaContentPieceUpdate.mockResolvedValue(piece);

      await service.setActiveVariation('piece-001', 'job-001', 'user-001');

      // Must use $transaction — not two separate DB calls
      expect(prismaTransaction).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException on cross-user access', async () => {
      const piece = makePiece({ job: { userId: 'user-999' } });
      prismaContentPieceFindUnique.mockResolvedValue(piece);

      await expect(
        service.setActiveVariation('piece-001', 'job-001', 'user-001'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prismaTransaction).not.toHaveBeenCalled();
    });

    it('throws KBCNT0005 when piece is not found', async () => {
      prismaContentPieceFindUnique.mockResolvedValue(null);

      await expect(
        service.setActiveVariation('missing', 'job-001', 'user-001'),
      ).rejects.toBeInstanceOf(AppError);

      try {
        await service.setActiveVariation('missing', 'job-001', 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.PIECE_NOT_FOUND.code);
      }
    });
  });

  // -------------------------------------------------------------------------
  // generateVariation()
  // -------------------------------------------------------------------------

  describe('generateVariation()', () => {
    it('publishes a single-step message to kms.content with correct platform step', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob());
      prismaContentPieceCount.mockResolvedValue(1); // 1 existing variation

      const dto: GenerateVariationDto = {};
      await service.generateVariation('job-001', 'linkedin', dto, 'user-001');

      expect(mockPublishContentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          job_id: 'job-001',
          user_id: 'user-001',
          step: 'linkedin',
          platform: 'linkedin',
        }),
      );
    });

    it('sets variation_index to the next available slot (count of existing variations)', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob());
      // 2 existing variations -> next index = 2
      prismaContentPieceCount.mockResolvedValue(2);

      const dto: GenerateVariationDto = {};
      await service.generateVariation('job-001', 'linkedin', dto, 'user-001');

      expect(mockPublishContentJob).toHaveBeenCalledWith(
        expect.objectContaining({ variation_index: 2 }),
      );
    });

    it('throws KBCNT0009 when max variations (5) are already reached', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob());
      prismaContentPieceCount.mockResolvedValue(5); // Already at max

      const dto: GenerateVariationDto = {};

      await expect(
        service.generateVariation('job-001', 'linkedin', dto, 'user-001'),
      ).rejects.toBeInstanceOf(AppError);

      try {
        await service.generateVariation('job-001', 'linkedin', dto, 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.VARIATION_FAILED.code);
      }
      expect(mockPublishContentJob).not.toHaveBeenCalled();
    });

    it('includes instruction in config_snapshot when dto.instruction is provided', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob());
      prismaContentPieceCount.mockResolvedValue(0);

      const dto: GenerateVariationDto = { instruction: 'Make it shorter' };
      await service.generateVariation('job-001', 'linkedin', dto, 'user-001');

      expect(mockPublishContentJob).toHaveBeenCalledWith(
        expect.objectContaining({
          config_snapshot: expect.objectContaining({
            variation_instruction: 'Make it shorter',
          }),
        }),
      );
    });

    it('throws ForbiddenException when job belongs to another user', async () => {
      prismaContentJobFindUnique.mockResolvedValue(makeJob({ userId: 'user-999' }));

      const dto: GenerateVariationDto = {};
      await expect(
        service.generateVariation('job-001', 'linkedin', dto, 'user-001'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws KBCNT0001 when job does not exist', async () => {
      prismaContentJobFindUnique.mockResolvedValue(null);

      const dto: GenerateVariationDto = {};
      await expect(
        service.generateVariation('missing', 'linkedin', dto, 'user-001'),
      ).rejects.toBeInstanceOf(AppError);

      try {
        await service.generateVariation('missing', 'linkedin', dto, 'user-001');
      } catch (err) {
        expect((err as AppError).code).toBe(ERROR_CODES.CNT.JOB_NOT_FOUND.code);
      }
    });
  });
});
