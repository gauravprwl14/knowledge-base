import { Injectable } from '@nestjs/common';
import { Prisma, KmsScanJob, ScanJobStatus, ScanJobType } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for KmsScanJob entity operations.
 * Provides multi-tenant isolation by scoping queries to userId or sourceId.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ScanService {
 *   constructor(private readonly scanJobRepository: ScanJobRepository) {}
 *
 *   async getActiveJobForSource(sourceId: string, userId: string) {
 *     return this.scanJobRepository.findActiveBySourceId(sourceId, userId);
 *   }
 * }
 * ```
 */
@Injectable()
export class ScanJobRepository extends BaseRepository<
  KmsScanJob,
  Prisma.KmsScanJobCreateInput,
  Prisma.KmsScanJobUpdateInput,
  Prisma.KmsScanJobWhereInput,
  Prisma.KmsScanJobWhereUniqueInput,
  Prisma.KmsScanJobOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'kmsScanJob');
  }

  /**
   * Finds all scan jobs for a given user (multi-tenant isolation)
   * @param userId - The user ID for multi-tenant isolation
   * @returns Array of scan jobs owned by the user
   */
  async findByUserId(userId: string): Promise<KmsScanJob[]> {
    return this.findMany({ userId }, { createdAt: 'desc' });
  }

  /**
   * Finds all scan jobs for a given source
   * @param sourceId - The source ID to look up jobs for
   * @param userId - The user ID for multi-tenant isolation
   * @returns Array of scan jobs for the source
   */
  async findBySourceId(sourceId: string, userId: string): Promise<KmsScanJob[]> {
    return this.findMany({ sourceId, userId }, { createdAt: 'desc' });
  }

  /**
   * Finds the most recent scan job for a source
   * @param sourceId - The source ID
   * @param userId - The user ID for multi-tenant isolation
   * @returns The latest scan job or null
   */
  async findLatestBySourceId(sourceId: string, userId: string): Promise<KmsScanJob | null> {
    return this.findFirst({ sourceId, userId }, { createdAt: 'desc' });
  }

  /**
   * Finds the active (QUEUED or RUNNING) scan job for a source
   * @param sourceId - The source ID
   * @param userId - The user ID for multi-tenant isolation
   * @returns The active scan job or null
   */
  async findActiveBySourceId(sourceId: string, userId: string): Promise<KmsScanJob | null> {
    return this.findFirst(
      {
        sourceId,
        userId,
        status: { in: [ScanJobStatus.QUEUED, ScanJobStatus.RUNNING] },
      },
      { createdAt: 'desc' },
    );
  }

  /**
   * Finds jobs by status (for worker/queue processing)
   * @param status - The job status to filter by
   * @returns Array of matching scan jobs
   */
  async findByStatus(status: ScanJobStatus): Promise<KmsScanJob[]> {
    return this.findMany({ status }, { createdAt: 'asc' });
  }

  /**
   * Marks a scan job as started
   * @param jobId - The scan job ID
   * @returns The updated scan job
   */
  async markStarted(jobId: string): Promise<KmsScanJob> {
    return this.update({ id: jobId }, { status: ScanJobStatus.RUNNING, startedAt: new Date() });
  }

  /**
   * Marks a scan job as completed with file counts
   * @param jobId - The scan job ID
   * @param filesFound - Total files found during scan
   * @param filesAdded - New files added to the index
   * @returns The updated scan job
   */
  async markCompleted(jobId: string, filesFound: number, filesAdded: number): Promise<KmsScanJob> {
    const now = new Date();
    return this.update(
      { id: jobId },
      {
        status: ScanJobStatus.COMPLETED,
        finishedAt: now,
        completedAt: now,
        filesFound,
        filesAdded,
      },
    );
  }

  /**
   * Marks a scan job as failed with an error message
   * @param jobId - The scan job ID
   * @param errorMessage - The error message describing the failure
   * @returns The updated scan job
   */
  async markFailed(jobId: string, errorMessage: string): Promise<KmsScanJob> {
    const now = new Date();
    return this.update(
      { id: jobId },
      {
        status: ScanJobStatus.FAILED,
        finishedAt: now,
        errorMessage,
        errorMsg: errorMessage,
      },
    );
  }

  /**
   * Cancels a scan job that is still queued or running
   * @param jobId - The scan job ID
   * @returns The updated scan job
   */
  async cancel(jobId: string): Promise<KmsScanJob> {
    return this.update(
      { id: jobId },
      { status: ScanJobStatus.CANCELLED, finishedAt: new Date() },
    );
  }

  /**
   * Creates a new scan job for a source
   * @param sourceId - The source ID to scan
   * @param userId - The user ID for multi-tenant isolation
   * @param type - The scan type (FULL or INCREMENTAL)
   * @returns The created scan job
   */
  async createJob(
    sourceId: string,
    userId: string,
    type: ScanJobType = ScanJobType.FULL,
  ): Promise<KmsScanJob> {
    return this.create({
      status: ScanJobStatus.QUEUED,
      type,
      source: { connect: { id: sourceId } },
      userId,
    });
  }
}
