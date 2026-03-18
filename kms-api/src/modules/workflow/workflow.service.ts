import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { AppLogger } from '../../logger/logger.service';
import { IngestUrlDto, WorkflowJobDto } from './dto/ingest-url.dto';

/**
 * WorkflowService manages lifecycle operations for URL-ingestion workflow jobs.
 *
 * Responsibilities:
 * - Generate a deterministic UUID job ID that doubles as the BullMQ job ID,
 *   enabling O(1) look-ups via `queue.getJob(id)`.
 * - Enqueue a `url-ingest` job on the `workflow` BullMQ queue with retry policy.
 * - Expose a lightweight status-check method used by the controller's poll endpoint.
 *
 * Actual processing (url-agent → summary → content-store) is handled by
 * WorkflowProcessor which runs in the same NestJS process as a BullMQ Worker.
 */
@Injectable()
export class WorkflowService {
  private readonly logger: AppLogger;

  constructor(
    // Inject the BullMQ Queue instance registered under the name 'workflow'
    @InjectQueue('workflow') private readonly workflowQueue: Queue,
    logger: AppLogger,
  ) {
    // Bind class name as structured logging context for every log emitted here
    this.logger = logger.child({ context: WorkflowService.name });
  }

  /**
   * Enqueue a URL-ingest job on the BullMQ `workflow` queue.
   *
   * The job payload carries everything the processor needs so it can run
   * without further DB queries: url, userId, collectionId, and timestamps.
   *
   * Retry policy: 3 attempts with exponential back-off starting at 2 s.
   * This handles transient url-agent timeouts and Anthropic rate limits.
   *
   * @param dto    - Validated ingest request (url + optional collectionId).
   * @param userId - JWT subject — stored in the job for audit / ownership.
   * @returns WorkflowJobDto with status `queued` and the assigned job ID.
   */
  async queueUrlIngest(dto: IngestUrlDto, userId: string): Promise<WorkflowJobDto> {
    // Stable UUID shared between our domain model and BullMQ — allows
    // direct look-up with queue.getJob(jobId) without a secondary index
    const jobId = uuidv4();
    const now = new Date().toISOString();

    // Enqueue the job; BullMQ serialises the data object to Redis
    await this.workflowQueue.add(
      'url-ingest', // job name — WorkflowProcessor routes on this
      {
        jobId,
        url: dto.url,
        userId,
        collectionId: dto.collectionId,
        queuedAt: now,
      },
      {
        // Use our UUID as BullMQ job ID so GET /jobs/:jobId can do O(1) lookup
        jobId,
        // Retry up to 3 times; exponential back-off handles transient failures
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        // Remove completed jobs after 24 h to prevent Redis memory growth
        removeOnComplete: { age: 86_400 },
        // Keep failed jobs for 7 days for debugging
        removeOnFail: { age: 604_800 },
      },
    );

    this.logger.info('URL ingest job queued', { jobId, url: dto.url, userId });

    return { jobId, url: dto.url, status: 'queued', queuedAt: now };
  }

  /**
   * Retrieve the current BullMQ state of a workflow job.
   *
   * BullMQ states: `waiting` | `active` | `completed` | `failed` | `delayed`
   * Returns `not_found` if no job with the given ID exists in Redis.
   *
   * @param jobId - UUID v4 job identifier (same as BullMQ job ID).
   * @returns Object with jobId and state string.
   */
  async getJobStatus(jobId: string): Promise<{ jobId: string; status: string }> {
    // BullMQ getJob returns null if the job has expired or never existed
    const job = await this.workflowQueue.getJob(jobId);

    if (!job) {
      // Return a soft 'not_found' rather than throwing so callers can handle polling gracefully
      return { jobId, status: 'not_found' };
    }

    // getState() resolves to the current BullMQ lifecycle state string
    const state = await job.getState();
    return { jobId, status: state };
  }
}
