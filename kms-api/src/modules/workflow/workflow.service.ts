import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { IngestUrlDto, WorkflowJobDto } from './dto/ingest-url.dto';
import { WorkflowProcessorService } from './workflow.processor';

/**
 * WorkflowService manages lifecycle operations for URL-ingestion workflow jobs.
 *
 * Responsibilities:
 * - Generate a deterministic UUID job ID and persist a `kms_workflow_jobs` record.
 * - Kick off async processing via `setImmediate` so the HTTP response is returned
 *   instantly (ADR-0028: no BullMQ — use direct async processing instead).
 * - Expose a lightweight status-check method used by the controller's poll endpoint.
 *
 * Actual processing (url-agent → summary → content-store) is handled by
 * WorkflowProcessorService which runs in the same NestJS process.
 */
@Injectable()
export class WorkflowService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: WorkflowProcessorService,
    logger: AppLogger,
  ) {
    // Bind class name as structured logging context for every log emitted here
    this.logger = logger.child({ context: WorkflowService.name });
  }

  /**
   * Accept a URL-ingest request, create a DB record, and schedule async processing.
   *
   * Per ADR-0028 we do NOT use BullMQ.  Instead we:
   * 1. INSERT a `kms_workflow_jobs` row with status=QUEUED.
   * 2. Return the job DTO immediately (HTTP 201 — fast acknowledgement).
   * 3. Schedule `processor.processUrlIngest` via `setImmediate` so it runs
   *    on the next event-loop tick without blocking the HTTP response.
   *
   * @param dto    - Validated ingest request (url + optional collectionId).
   * @param userId - JWT subject — stored in the job for audit / ownership.
   * @returns WorkflowJobDto with status `queued` and the assigned job ID.
   */
  async queueUrlIngest(dto: IngestUrlDto, userId: string): Promise<WorkflowJobDto> {
    const jobId = uuidv4();

    // Persist the job record so GET /jobs/:jobId can return status immediately
    const job = await this.prisma.kmsWorkflowJob.create({
      data: {
        id: jobId,
        userId,
        url: dto.url,
        status: 'QUEUED',
        collectionId: dto.collectionId ?? null,
      },
    });

    this.logger.info('URL ingest job created', { jobId, url: dto.url, userId });

    // Fire-and-forget: schedule processing on the next event-loop tick.
    // Errors are caught and logged inside processUrlIngest — they will also
    // update the DB record to status=FAILED for visibility via the poll endpoint.
    setImmediate(() =>
      this.processor
        .processUrlIngest(jobId, dto.url, userId, dto.collectionId)
        .catch((err: Error) =>
          this.logger.error({ err, jobId }, 'URL ingest processing failed unexpectedly'),
        ),
    );

    return {
      jobId,
      url: dto.url,
      status: 'queued',
      queuedAt: job.createdAt.toISOString(),
    };
  }

  /**
   * Retrieve the current status of a workflow job from the database.
   *
   * Statuses stored in `kms_workflow_jobs.status`:
   * - `QUEUED`     — accepted, awaiting setImmediate execution
   * - `PROCESSING` — actively being processed
   * - `COMPLETED`  — pipeline finished successfully
   * - `FAILED`     — pipeline error (see `error` column for details)
   *
   * Returns `not_found` (soft) when the job ID is unknown so callers can
   * handle polling gracefully without catching exceptions.
   *
   * @param jobId - UUID v4 job identifier returned by POST /workflow/urls/ingest.
   * @returns Object with jobId and current status string (lowercased).
   * @throws AppError(KBWFL0001) when strict not-found behaviour is needed by
   *         callers that want a 404 rather than a soft response.
   */
  async getJobStatus(jobId: string): Promise<{ jobId: string; status: string }> {
    const job = await this.prisma.kmsWorkflowJob.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });

    if (!job) {
      // Soft not-found: return a stable shape so polling loops don't need
      // to handle exceptions.  Callers wanting a hard 404 can throw themselves.
      this.logger.warn('Workflow job not found', { jobId });
      throw new AppError({
        code: ERROR_CODES.WFL.WORKFLOW_JOB_NOT_FOUND.code,
        message: `Workflow job ${jobId} not found`,
      });
    }

    // Normalise DB enum (UPPER_CASE) to lowercase for the HTTP response
    return { jobId: job.id, status: job.status.toLowerCase() };
  }
}
