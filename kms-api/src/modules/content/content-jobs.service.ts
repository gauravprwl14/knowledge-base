import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ContentJob, ContentJobStatus, ContentSourceType } from '@prisma/client';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { PrismaService } from '../../database/prisma/prisma.service';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { ContentJobPublisher } from './content-job.publisher';
import { CreateContentJobDto } from './dto/create-content-job.dto';
import { ListContentJobsQueryDto } from './dto/list-content-jobs-query.dto';
import { ContentJobResponseDto, mapJobToDto } from './dto/content-job-response.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Job statuses that represent an in-progress state.
 * Used by `detectStaleJobs` to identify jobs that may have timed out.
 */
const IN_PROGRESS_STATUSES: ContentJobStatus[] = [
  ContentJobStatus.QUEUED,
  ContentJobStatus.INGESTING,
  ContentJobStatus.EXTRACTING,
  ContentJobStatus.GENERATING,
];

/** Minutes of inactivity before a job is considered stale. */
const STALE_THRESHOLD_MINUTES = 15;

/**
 * ContentJobsService — business logic for content generation job lifecycle.
 *
 * Manages the full lifecycle of `ContentJob` records:
 *   - Creating jobs (with config snapshot + voice profile capture)
 *   - Publishing jobs to the `kms.content` RabbitMQ queue
 *   - Listing and retrieving jobs (always scoped to the requesting user)
 *   - Deleting jobs (ownership-verified, cascade handled by DB)
 *   - Detecting and marking stale jobs (called by a cron scheduler)
 *
 * All operations enforce user isolation — it is never possible to read,
 * modify, or delete another user's content jobs via this service.
 */
@Injectable()
export class ContentJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentJobPublisher: ContentJobPublisher,
    /**
     * Pino structured logger scoped to this service.
     * Injected via `@InjectPinoLogger` so every log line automatically carries
     * the service class name as context — matches the mandatory NestJS logging pattern.
     */
    @InjectPinoLogger(ContentJobsService.name)
    private readonly logger: PinoLogger,
  ) {}

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  /**
   * Creates a new content generation job and publishes it to the worker queue.
   *
   * Steps:
   *  1. Load the user's `ContentConfiguration` (or use an empty default).
   *  2. Load the user's `CreatorVoiceProfile` (or use an empty string).
   *  3. Persist the `ContentJob` row with status=QUEUED and a config snapshot.
   *  4. Publish a `ContentJobMessage` to `kms.content`.
   *  5. If publish fails: mark the job FAILED and throw KBCNT0012.
   *
   * The config snapshot is captured at creation time so that later changes to
   * the user's configuration do not retroactively affect running or historical jobs.
   *
   * @param dto    - Validated creation payload.
   * @param userId - Authenticated user UUID.
   * @returns The newly created job serialised as a `ContentJobResponseDto`.
   * @throws {AppError} KBCNT0012 when publishing to RabbitMQ fails (job marked FAILED).
   */
  @Trace({ name: 'content-jobs.create' })
  async createJob(dto: CreateContentJobDto, userId: string): Promise<ContentJobResponseDto> {
    this.logger.info({ userId, sourceType: dto.sourceType }, 'createJob — start');

    // ── Step 1: Load user's content configuration (for snapshot) ──────────
    // We use the stored config as the snapshot so the worker always sees the
    // settings that were active when the job was submitted. If no config exists,
    // an empty object is used — the worker applies its own defaults.
    //
    // IMPORTANT: The snapshot is wrapped under a `platforms` key so the schema
    // is explicit and the worker can safely read `config_snapshot["platforms"]`
    // without risking false positives if new top-level keys are added later
    // (e.g. globalSettings, version). Without the wrapper the worker would have
    // to treat every key as a potential platform name.
    const contentConfig = await this.prisma.contentConfiguration.findUnique({
      where: { userId },
    });
    const configSnapshot: Record<string, unknown> = contentConfig
      ? { platforms: contentConfig.platformConfig as Record<string, unknown> }
      : { platforms: {} };

    // ── Step 2: Load user's voice profile ────────────────────────────────
    // An empty string is a valid value — the worker skips voice personalisation
    // when voiceBriefText is empty. Logging at debug to avoid PII leakage.
    const voiceProfile = await this.prisma.creatorVoiceProfile.findUnique({
      where: { userId },
    });
    const voiceProfileText = voiceProfile?.profileText ?? '';

    if (!voiceProfile) {
      // Log at info — not a blocking error; the worker handles missing profiles gracefully.
      this.logger.info({ userId }, 'createJob — no voice profile found; using empty string');
    }

    // ── Step 3: Persist the ContentJob row ────────────────────────────────
    const job = await this.prisma.contentJob.create({
      data: {
        userId,
        sourceType: dto.sourceType,
        sourceUrl: dto.sourceUrl ?? null,
        sourceFileId: dto.sourceFileId ?? null,
        status: ContentJobStatus.QUEUED,
        // Cast to Prisma.InputJsonValue — Prisma requires this for Json fields
        // when the value is typed as Record<string, unknown>.
        configSnapshot: configSnapshot as object,
        voiceBriefText: voiceProfileText,
        tags: dto.tags ?? [],
        stepsJson: {} as object,
      },
      include: { pieces: true },
    });

    this.logger.info({ jobId: job.id, userId }, 'createJob — job persisted');

    // ── Step 4: Publish to kms.content queue ─────────────────────────────
    // The job row exists before we publish so the worker can always look it up
    // even if it picks up the message before the commit returns to the client.
    try {
      await this.contentJobPublisher.publishContentJob({
        job_id: job.id,
        user_id: userId,
        source_type: dto.sourceType.toLowerCase(),
        source_url: dto.sourceUrl,
        source_file_id: dto.sourceFileId,
        config_snapshot: configSnapshot,
        voice_profile: voiceProfileText,
        step: 'full',
      });
    } catch (err) {
      // ── Step 5 (error path): Mark job as FAILED ──────────────────────
      // The job row persists in FAILED state so the user can see it and retry.
      this.logger.error({ jobId: job.id, userId, error: String(err) }, 'createJob — RabbitMQ publish failed; marking job FAILED');

      // Mark the job failed — best-effort; do not throw if this also fails
      try {
        await this.prisma.contentJob.update({
          where: { id: job.id },
          data: {
            status: ContentJobStatus.FAILED,
            errorMessage: 'Failed to queue content job for processing',
          },
        });
      } catch (updateErr) {
        this.logger.error({ jobId: job.id, error: String(updateErr) }, 'createJob — could not mark job FAILED after publish failure');
      }

      throw new AppError({
        code: ERROR_CODES.CNT.QUEUE_PUBLISH_FAILED.code,
        message: 'Failed to queue content job for processing. Please try again.',
        cause: err instanceof Error ? err : undefined,
      });
    }

    this.logger.info({ jobId: job.id, userId }, 'createJob — published successfully');
    return mapJobToDto(job);
  }

  // ---------------------------------------------------------------------------
  // GET ONE
  // ---------------------------------------------------------------------------

  /**
   * Returns a single content job by its UUID, including all generated pieces.
   *
   * Verifies ownership: if the job exists but belongs to another user, a 403
   * ForbiddenException is thrown (not a 404) to distinguish genuine missing
   * jobs from IDOR attempts. This differs from `FilesService` which always
   * returns 404 — for content jobs we want the 403 signal for debugging.
   *
   * @param jobId  - Content job UUID.
   * @param userId - Authenticated user UUID.
   * @returns The job with nested pieces, serialised as `ContentJobResponseDto`.
   * @throws {AppError}          KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)          when the job belongs to another user.
   */
  @Trace({ name: 'content-jobs.get' })
  async getJob(jobId: string, userId: string): Promise<ContentJobResponseDto> {
    this.logger.info({ jobId, userId }, 'getJob');

    const job = await this.prisma.contentJob.findUnique({
      where: { id: jobId },
      include: { pieces: true },
    });

    if (!job) {
      throw new AppError({ code: ERROR_CODES.CNT.JOB_NOT_FOUND.code });
    }

    // IDOR guard — the job exists but belongs to a different user
    if (job.userId !== userId) {
      this.logger.warn({ jobId, requesterId: userId, ownerId: job.userId }, 'getJob — ownership mismatch; access denied');
      throw new ForbiddenException('You do not have access to this content job');
    }

    return mapJobToDto(job);
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of content jobs for the authenticated user.
   *
   * The `userId` filter is applied unconditionally at the DB layer — it is never
   * possible for this method to return another user's jobs regardless of the
   * cursor or filter values provided.
   *
   * Pagination uses `createdAt DESC` ordering with a base64-encoded createdAt
   * ISO string as the cursor. This gives stable pages even as new jobs are created.
   *
   * @param query  - Optional status/sourceType filters and pagination params.
   * @param userId - Authenticated user UUID.
   * @returns `{ items, total, nextCursor }` where `nextCursor` is null on the last page.
   */
  @Trace({ name: 'content-jobs.list' })
  async listJobs(
    query: ListContentJobsQueryDto,
    userId: string,
  ): Promise<{ items: ContentJobResponseDto[]; total: number; nextCursor: string | null }> {
    const limit = query.limit ?? 20;

    this.logger.info({ userId, status: query.status, sourceType: query.sourceType, limit }, 'listJobs');

    // Decode the cursor — it encodes the `createdAt` of the last item on the previous page
    let cursorDate: Date | undefined;
    if (query.cursor) {
      try {
        const decoded = Buffer.from(query.cursor, 'base64').toString('utf8');
        cursorDate = new Date(decoded);
      } catch {
        // Invalid cursor — treat as no cursor (start from the beginning)
        this.logger.warn({ userId, cursor: query.cursor }, 'listJobs — invalid cursor; ignoring');
      }
    }

    // Build the WHERE clause — always scoped to userId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      userId, // Non-negotiable: always filter to the requesting user
      ...(query.status ? { status: query.status } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    };

    // Fetch one extra item to detect whether a next page exists
    const [jobs, total] = await Promise.all([
      this.prisma.contentJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        include: { pieces: true },
      }),
      // Total is the count without the cursor filter so the UI can show "N total"
      this.prisma.contentJob.count({ where: { userId, ...(query.status ? { status: query.status } : {}), ...(query.sourceType ? { sourceType: query.sourceType } : {}) } }),
    ]);

    // Determine whether there is a next page
    const hasNextPage = jobs.length > limit;
    const items = hasNextPage ? jobs.slice(0, limit) : jobs;

    // Build the cursor from the createdAt of the last item on this page
    const nextCursor =
      hasNextPage && items.length > 0
        ? Buffer.from(items[items.length - 1].createdAt.toISOString()).toString('base64')
        : null;

    return {
      items: items.map((j) => mapJobToDto(j as ContentJob & { pieces: any[] })),
      total,
      nextCursor,
    };
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  /**
   * Deletes a content job and all its associated pieces.
   *
   * Cascade deletion of `ContentPiece` rows is handled by the DB `ON DELETE CASCADE`
   * constraint on `content_pieces.job_id` — no explicit child delete is needed here.
   *
   * @param jobId  - Content job UUID.
   * @param userId - Authenticated user UUID.
   * @throws {AppError}          KBCNT0001 (404) when the job does not exist.
   * @throws {ForbiddenException} (403)          when the job belongs to another user.
   */
  @Trace({ name: 'content-jobs.delete' })
  async deleteJob(jobId: string, userId: string): Promise<void> {
    this.logger.info({ jobId, userId }, 'deleteJob');

    // Verify the job exists and belongs to the requesting user before deleting
    const job = await this.prisma.contentJob.findUnique({ where: { id: jobId } });

    if (!job) {
      throw new AppError({ code: ERROR_CODES.CNT.JOB_NOT_FOUND.code });
    }

    if (job.userId !== userId) {
      this.logger.warn({ jobId, requesterId: userId, ownerId: job.userId }, 'deleteJob — ownership mismatch; access denied');
      throw new ForbiddenException('You do not have access to this content job');
    }

    await this.prisma.contentJob.delete({ where: { id: jobId } });
    this.logger.info({ jobId, userId }, 'deleteJob — deleted');
  }

  // ---------------------------------------------------------------------------
  // MARK FAILED (internal)
  // ---------------------------------------------------------------------------

  /**
   * Marks a content job as FAILED with the given error message.
   *
   * This is an internal method — not exposed via HTTP. Called by the stale job
   * cron and by `createJob` when the RabbitMQ publish fails.
   *
   * @param jobId        - Content job UUID.
   * @param errorMessage - Human-readable reason for the failure.
   */
  @Trace({ name: 'content-jobs.mark-failed' })
  async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    this.logger.info({ jobId, errorMessage }, 'markJobFailed');

    await this.prisma.contentJob.update({
      where: { id: jobId },
      data: {
        status: ContentJobStatus.FAILED,
        errorMessage,
      },
    });

    this.logger.info({ jobId }, 'markJobFailed — updated');
  }

  // ---------------------------------------------------------------------------
  // STALE JOB DETECTION (cron target)
  // ---------------------------------------------------------------------------

  /**
   * Scans for stale in-progress jobs and marks them as FAILED.
   *
   * A job is considered stale when it has been in one of the active statuses
   * (QUEUED, INGESTING, EXTRACTING, GENERATING) for longer than
   * `STALE_THRESHOLD_MINUTES` without any `updatedAt` change.
   *
   * This is intended to be called by a `@Cron` scheduler (e.g. every 5 minutes)
   * from the ContentModule. It does NOT need user context — it operates across
   * all users' jobs.
   *
   * @returns The number of jobs that were marked stale (for monitoring/alerting).
   */
  @Trace({ name: 'content-jobs.detect-stale' })
  async detectStaleJobs(): Promise<number> {
    // Compute the cutoff timestamp — any in-progress job not updated since this
    // timestamp is considered stale.
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60 * 1000);

    const staleJobs = await this.prisma.contentJob.findMany({
      where: {
        status: { in: IN_PROGRESS_STATUSES },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, userId: true, status: true, updatedAt: true },
    });

    if (staleJobs.length === 0) {
      return 0;
    }

    // Log each stale job individually so alerts can fire per-job if needed
    for (const job of staleJobs) {
      this.logger.warn(
        { job_id: job.id, userId: job.userId, status: job.status, lastUpdatedAt: job.updatedAt, staleThresholdMinutes: STALE_THRESHOLD_MINUTES },
        'detectStaleJobs — stale job found; marking FAILED',
      );
    }

    const staleJobIds = staleJobs.map((j) => j.id);

    // Batch-update all stale jobs to FAILED in one query
    await this.prisma.contentJob.updateMany({
      where: { id: { in: staleJobIds } },
      data: {
        status: ContentJobStatus.FAILED,
        errorMessage: `Job timed out — no progress for ${STALE_THRESHOLD_MINUTES} minutes`,
      },
    });

    this.logger.info({ count: staleJobs.length }, 'detectStaleJobs — marked stale jobs FAILED');
    return staleJobs.length;
  }
}
