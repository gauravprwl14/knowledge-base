import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ContentPiece } from '@prisma/client';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { ContentJobPublisher } from './content-job.publisher';
import { UpdateContentPieceDto } from './dto/update-content-piece.dto';
import { GenerateVariationDto } from './dto/generate-variation.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of variations allowed per (jobId, platform, format) combination. */
const MAX_VARIATIONS_PER_PLATFORM = 5;

/**
 * ContentPiecesService — business logic for content piece management.
 *
 * A `ContentPiece` represents a single generated output: one platform, one
 * format, one variation index. This service manages:
 *   - Reading pieces scoped to a verified job owner
 *   - Updating piece content with optimistic locking (version field)
 *   - Atomically swapping the active variation for a platform
 *   - Requesting additional variations via the `kms.content` queue
 *
 * All mutations verify ownership via job.userId === userId to prevent IDOR.
 */
@Injectable()
export class ContentPiecesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentJobPublisher: ContentJobPublisher,
    /**
     * Pino structured logger scoped to this service.
     * Injected via `@InjectPinoLogger` so every log line automatically carries
     * the service class name as context — matches the mandatory NestJS logging pattern.
     */
    @InjectPinoLogger(ContentPiecesService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal helper
  // ---------------------------------------------------------------------------

  /**
   * Verifies that a content job exists and belongs to the given user.
   *
   * Extracted as a shared helper because several methods need the same ownership
   * check before proceeding.
   *
   * @param jobId  - UUID of the content job.
   * @param userId - Authenticated user UUID.
   * @returns The verified job record.
   * @throws {AppError}           KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)           when the job belongs to another user.
   */
  private async verifyJobOwnership(jobId: string, userId: string) {
    const job = await this.prisma.contentJob.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new AppError({ code: ERROR_CODES.CNT.JOB_NOT_FOUND.code });
    }

    if (job.userId !== userId) {
      this.logger.warn('verifyJobOwnership — IDOR attempt blocked', {
        jobId,
        requesterId: userId,
        ownerId: job.userId,
      });
      throw new ForbiddenException('You do not have access to this content job');
    }

    return job;
  }

  // ---------------------------------------------------------------------------
  // GET ALL PIECES FOR JOB
  // ---------------------------------------------------------------------------

  /**
   * Returns all content pieces for a job, sorted by platform -> format -> variationIndex.
   *
   * Job ownership is verified before returning pieces — if the job does not
   * belong to `userId` this method throws 403 rather than silently returning
   * an empty list (which could mask an IDOR bug).
   *
   * @param jobId  - Content job UUID.
   * @param userId - Authenticated user UUID.
   * @returns Array of all pieces for the job.
   * @throws {AppError}           KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)           when the job belongs to another user.
   */
  @Trace({ name: 'content-pieces.get-for-job' })
  async getPiecesForJob(jobId: string, userId: string): Promise<ContentPiece[]> {
    // Verify ownership first — throws if job is missing or foreign
    await this.verifyJobOwnership(jobId, userId);

    const pieces = await this.prisma.contentPiece.findMany({
      where: { jobId },
      orderBy: [{ platform: 'asc' }, { format: 'asc' }, { variationIndex: 'asc' }],
    });

    this.logger.info('getPiecesForJob', { jobId, userId, count: pieces.length });
    return pieces;
  }

  // ---------------------------------------------------------------------------
  // GET PIECES FOR PLATFORM
  // ---------------------------------------------------------------------------

  /**
   * Returns all variations for a specific platform within a job.
   *
   * Active variations are sorted first so the caller can trivially take
   * `result[0]` to get the currently selected variation.
   *
   * @param jobId    - Content job UUID.
   * @param platform - Platform name (e.g. 'linkedin', 'blog').
   * @param userId   - Authenticated user UUID.
   * @returns Array of pieces for the platform, active variations first.
   * @throws {AppError}           KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)           when the job belongs to another user.
   */
  @Trace({ name: 'content-pieces.get-for-platform' })
  async getPiecesForPlatform(
    jobId: string,
    platform: string,
    userId: string,
  ): Promise<ContentPiece[]> {
    await this.verifyJobOwnership(jobId, userId);

    const pieces = await this.prisma.contentPiece.findMany({
      where: { jobId, platform },
      // Active variations first, then by variationIndex within each format
      orderBy: [{ isActive: 'desc' }, { format: 'asc' }, { variationIndex: 'asc' }],
    });

    this.logger.info('getPiecesForPlatform', { jobId, platform, userId, count: pieces.length });
    return pieces;
  }

  // ---------------------------------------------------------------------------
  // UPDATE PIECE
  // ---------------------------------------------------------------------------

  /**
   * Updates the content text of a single content piece using atomic optimistic locking.
   *
   * ## Concurrency safety
   * The version check is embedded directly inside the DB WHERE clause of a
   * single `updateMany` call. This eliminates the TOCTOU race that existed in
   * the previous read-then-check pattern: two concurrent requests that both
   * read `version=1` can no longer both write `version=2` — only one of them
   * will match the WHERE clause; the second will return `count=0`.
   *
   * ## IDOR protection
   * `userId` is included in the WHERE clause via the `job` relation so
   * ownership is enforced at the DB level, not only in application code. A
   * piece that exists but belongs to another user's job will produce `count=0`
   * and be treated as not-found (preventing information leakage).
   *
   * ## Conflict disambiguation
   * `updateMany` does not distinguish between "piece not found", "wrong user",
   * and "stale version" — all three produce `count=0`. On a zero result we
   * issue a cheap follow-up `findFirst` to decide which error to surface.
   * This extra read only occurs on the conflict/error path (rare), not on
   * every successful write.
   *
   * @param pieceId - Content piece UUID.
   * @param dto     - Update payload including new content and expected version.
   * @param userId  - Authenticated user UUID (derived from JWT by the controller).
   * @returns The updated `ContentPiece` record (fetched after the write).
   * @throws {AppError} KBCNT0005 (404) when the piece is not found or belongs to another user.
   * @throws {AppError} KBCNT0013 (409) when `dto.version` is stale (version conflict).
   */
  @Trace({ name: 'content-pieces.update' })
  async updatePiece(
    pieceId: string,
    dto: UpdateContentPieceDto,
    userId: string,
  ): Promise<ContentPiece> {
    this.logger.info('updatePiece — start', { pieceId, userId, version: dto.version });

    // ---------------------------------------------------------------------------
    // Atomic optimistic-lock update
    //
    // The WHERE clause includes both `job.userId` (IDOR guard) and `version`
    // (optimistic lock). Because both conditions are evaluated inside a single
    // DB statement there is no race window between them.
    //
    // `{ increment: 1 }` uses Prisma's atomic increment operator so the version
    // bump is also part of the same statement — no separate UPDATE is needed.
    // ---------------------------------------------------------------------------
    const result = await this.prisma.contentPiece.updateMany({
      where: {
        id: pieceId,
        // Enforce ownership at the DB level — a piece belonging to another
        // user's job will not match and returns count=0 (same as not-found).
        job: { userId },
        // Stale version => 0 rows updated; client must re-fetch and retry.
        version: dto.version,
      },
      data: {
        content: dto.content,
        // Atomically increment version — no separate read is required.
        version: { increment: 1 },
        editedAt: new Date(),
      },
    });

    if (result.count === 0) {
      // 0 rows updated — could be: piece doesn't exist, wrong user, or stale
      // version. Issue a single cheap follow-up read to distinguish the cases.
      // This read only happens on the error path (rare), not on every write.
      const existing = await this.prisma.contentPiece.findFirst({
        where: { id: pieceId, job: { userId } },
        select: { id: true, version: true },
      });

      if (!existing) {
        // Piece is either missing or belongs to another user — do not leak
        // existence information; surface a uniform 404.
        this.logger.warn('updatePiece — piece not found or access denied', {
          pieceId,
          userId,
          sentVersion: dto.version,
        });
        throw new AppError({ code: ERROR_CODES.CNT.PIECE_NOT_FOUND.code });
      }

      // Piece exists and belongs to the user — the version was stale.
      this.logger.warn('updatePiece — version conflict', {
        pieceId,
        userId,
        sentVersion: dto.version,
        currentVersion: existing.version,
      });
      throw new AppError({
        code: ERROR_CODES.CNT.PIECE_VERSION_CONFLICT.code,
        message: `Version conflict: current version is ${existing.version}, you sent ${dto.version}. Re-fetch the piece and retry.`,
      });
    }

    // Fetch and return the updated record. `updateMany` does not return rows,
    // so this extra read is required. It runs only on the happy path.
    const updated = await this.prisma.contentPiece.findUniqueOrThrow({
      where: { id: pieceId },
    });

    this.logger.info('updatePiece — updated', { pieceId, userId, newVersion: updated.version });
    return updated;
  }

  // ---------------------------------------------------------------------------
  // SET ACTIVE VARIATION
  // ---------------------------------------------------------------------------

  /**
   * Atomically sets one variation as active and deactivates all others for the
   * same (jobId, platform, format) triple.
   *
   * Uses a single `prisma.$transaction` to ensure the swap is atomic — there
   * is never a window where either zero or two variations are active at once.
   *
   * @param pieceId - UUID of the variation to make active.
   * @param jobId   - UUID of the parent job (used to scope the deactivation).
   * @param userId  - Authenticated user UUID.
   * @throws {AppError}           KBCNT0005 (404) when the target piece is not found.
   * @throws {ForbiddenException} (403)           when the piece belongs to another user's job.
   */
  @Trace({ name: 'content-pieces.set-active' })
  async setActiveVariation(pieceId: string, jobId: string, userId: string): Promise<void> {
    this.logger.info('setActiveVariation — start', { pieceId, jobId, userId });

    // Step 1: Verify the target piece exists and belongs to the user
    const piece = await this.prisma.contentPiece.findUnique({
      where: { id: pieceId },
      include: { job: { select: { userId: true } } },
    });

    if (!piece) {
      throw new AppError({ code: ERROR_CODES.CNT.PIECE_NOT_FOUND.code });
    }

    if (piece.job.userId !== userId) {
      this.logger.warn('setActiveVariation — cross-user access blocked', {
        pieceId,
        jobId,
        requesterId: userId,
        ownerId: piece.job.userId,
      });
      throw new ForbiddenException('You do not have access to this content piece');
    }

    // Step 2: Atomic swap in a single transaction
    // First deactivate ALL variations for this (jobId, platform, format),
    // then activate the target. Both writes happen in the same DB transaction.
    await this.prisma.$transaction([
      // Deactivate all variations for this platform+format combination
      this.prisma.contentPiece.updateMany({
        where: {
          jobId: piece.jobId,
          platform: piece.platform,
          format: piece.format,
        },
        data: { isActive: false },
      }),
      // Activate the target variation
      this.prisma.contentPiece.update({
        where: { id: pieceId },
        data: { isActive: true },
      }),
    ]);

    this.logger.info('setActiveVariation — variation activated', {
      pieceId,
      jobId: piece.jobId,
      platform: piece.platform,
      format: piece.format,
      userId,
    });
  }

  // ---------------------------------------------------------------------------
  // GENERATE VARIATION
  // ---------------------------------------------------------------------------

  /**
   * Requests an additional content variation for a specific platform by
   * publishing a single-step message to the `kms.content` queue.
   *
   * Enforces a maximum of `MAX_VARIATIONS_PER_PLATFORM` (5) variations per
   * (jobId, platform) combination. Throws KBCNT0009 if the limit is reached.
   *
   * The worker will create a new `ContentPiece` at `variationIndex = nextIndex`
   * (the next available slot) using the `instruction` override if provided.
   *
   * @param jobId    - Content job UUID.
   * @param platform - Target platform (e.g. 'linkedin').
   * @param dto      - Optional instruction override for the variation prompt.
   * @param userId   - Authenticated user UUID.
   * @throws {AppError}           KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)           when the job belongs to another user.
   * @throws {AppError}           KBCNT0009 (422) when the variation limit is exceeded.
   * @throws {AppError}           KBCNT0012 (503) when the RabbitMQ publish fails.
   */
  @Trace({ name: 'content-pieces.generate-variation' })
  async generateVariation(
    jobId: string,
    platform: string,
    dto: GenerateVariationDto,
    userId: string,
  ): Promise<void> {
    this.logger.info('generateVariation — start', { jobId, platform, userId });

    // Verify ownership first — throws 404/403 as appropriate
    const job = await this.verifyJobOwnership(jobId, userId);

    // Count existing variations for this platform to enforce the limit
    const existingCount = await this.prisma.contentPiece.count({
      where: { jobId, platform },
    });

    if (existingCount >= MAX_VARIATIONS_PER_PLATFORM) {
      this.logger.warn('generateVariation — max variations reached', {
        jobId,
        platform,
        existingCount,
        max: MAX_VARIATIONS_PER_PLATFORM,
      });
      throw new AppError({
        code: ERROR_CODES.CNT.VARIATION_FAILED.code,
        message: `Maximum variations (${MAX_VARIATIONS_PER_PLATFORM}) reached for platform '${platform}'`,
      });
    }

    // The next variation index is the current count (0-based, so count = next index)
    const variationIndex = existingCount;

    // Build the config snapshot for the publish message
    // Re-use the job's stored snapshot so the worker uses the same config
    const configSnapshot = (job.configSnapshot as Record<string, unknown>) ?? {};

    // Publish a single-platform step to the content queue
    await this.contentJobPublisher.publishContentJob({
      job_id: jobId,
      user_id: userId,
      source_type: job.sourceType.toLowerCase(),
      config_snapshot: configSnapshot,
      voice_profile: job.voiceBriefText ?? '',
      step: platform, // Single-platform re-run
      platform,
      variation_index: variationIndex,
      // Pass the instruction override in the config snapshot so the worker
      // can access it without needing a dedicated message field.
      // The worker looks for config_snapshot.variation_instruction if present.
      ...(dto.instruction
        ? { config_snapshot: { ...configSnapshot, variation_instruction: dto.instruction } }
        : {}),
    });

    this.logger.info('generateVariation — published', {
      jobId,
      platform,
      userId,
      variationIndex,
    });
  }
}
