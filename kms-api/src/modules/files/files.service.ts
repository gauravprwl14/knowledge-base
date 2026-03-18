import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { KmsFile, KmsScanJob, ScanJobType } from '@prisma/client';
import { FileRepository } from '../../database/repositories/file.repository';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { SourceRepository } from '../../database/repositories/source.repository';
import { ScanJobPublisher } from '../../queue/publishers/scan-job.publisher';
import { ErrorFactory } from '../../errors/types/error-factory';
import { Trace } from '../../telemetry/decorators/trace.decorator';

/**
 * Result shape for paginated file listings.
 */
export interface FilePageResult {
  /** Files on the current page */
  items: KmsFile[];
  /** Opaque cursor to pass as `cursor` for the next page; null if last page */
  nextCursor: string | null;
  /** Total file count for the user (without pagination) */
  total: number;
}

/**
 * FilesService handles all business logic for KMS file management.
 *
 * Files represent individual documents (PDFs, Markdown files, etc.) that have
 * been discovered by the scan-worker and processed by the embed-worker.
 * They are stored in the `kms_files` table and indexed in Qdrant.
 *
 * Multi-tenant isolation: every query is scoped to `userId`.
 *
 * @example
 * ```typescript
 * const page = await filesService.listFiles(userId, undefined, 20);
 * const file  = await filesService.getFile(fileId, userId);
 * const job   = await filesService.triggerScan(sourceId, userId, 'FULL');
 * ```
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly fileRepository: FileRepository,
    private readonly sourceRepository: SourceRepository,
    private readonly scanJobRepository: ScanJobRepository,
    private readonly scanJobPublisher: ScanJobPublisher,
    @InjectPinoLogger(FilesService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Returns a cursor-based page of files belonging to the caller.
   *
   * @param userId - Owner user UUID
   * @param cursor - Opaque cursor from a previous response (undefined for first page)
   * @param limit  - Max items per page (default: 20)
   * @returns Paginated file page with total count
   */
  @Trace({ name: 'files.listFiles' })
  async listFiles(userId: string, cursor?: string, limit = 20): Promise<FilePageResult> {
    const [page, total] = await Promise.all([
      this.fileRepository.findPage(userId, cursor, limit),
      this.fileRepository.count({ userId }),
    ]);
    return { items: page.items, nextCursor: page.nextCursor, total };
  }

  /**
   * Returns a single file by ID, scoped to the caller.
   *
   * @param id     - File UUID
   * @param userId - Owner user UUID
   * @returns The file record
   * @throws AppError(NOT_FOUND) if the file does not exist or belongs to another user
   */
  @Trace({ name: 'files.getFile' })
  async getFile(id: string, userId: string): Promise<KmsFile> {
    const file = await this.fileRepository.findFirst({ where: { id, userId } });
    if (!file) throw ErrorFactory.notFound('File', id);
    return file;
  }

  /**
   * Triggers a scan job for a source.
   *
   * If a QUEUED or RUNNING scan already exists for the source, it is returned
   * without creating a duplicate job.
   *
   * @param sourceId - Source UUID to scan
   * @param userId   - Owner user UUID (ownership is verified)
   * @param scanType - FULL or INCREMENTAL (default: FULL)
   * @returns The new or existing active KmsScanJob
   * @throws AppError(NOT_FOUND) if the source does not exist or belongs to another user
   */
  @Trace({ name: 'files.triggerScan' })
  async triggerScan(
    sourceId: string,
    userId: string,
    scanType: 'FULL' | 'INCREMENTAL' = 'FULL',
  ): Promise<KmsScanJob> {
    // Verify source ownership
    const source = await this.sourceRepository.findByIdAndUserId(sourceId, userId);
    if (!source) throw ErrorFactory.notFound('Source', sourceId);

    // Return existing active job rather than queueing a duplicate
    const activeScan = await this.scanJobRepository.findActiveBySourceId(sourceId, userId);
    if (activeScan) {
      this.logger.warn({ sourceId, userId, scanJobId: activeScan.id }, 'Scan already in progress — returning existing job');
      return activeScan;
    }

    // Persist a QUEUED job record before publishing to the queue
    const scanJob = await this.scanJobRepository.createJob(
      sourceId,
      userId,
      scanType === 'FULL' ? ScanJobType.FULL : ScanJobType.INCREMENTAL,
    );

    // Map Prisma SourceType enum to Python snake_case values
    const sourceTypeMap: Record<string, string> = {
      LOCAL: 'local',
      GOOGLE_DRIVE: 'google_drive',
      OBSIDIAN: 'obsidian',
    };

    // Publish to RabbitMQ — scan-worker picks this up (snake_case matches Python pydantic model)
    await this.scanJobPublisher.publishScanJob({
      scan_job_id: scanJob.id,
      source_id: sourceId,
      source_type: sourceTypeMap[source.type] ?? 'local',
      user_id: userId,
      scan_type: scanType,
      config: (source.configJson ?? {}) as Record<string, unknown>,
    });

    this.logger.info({ sourceId, userId, scanJobId: scanJob.id, scanType }, 'Scan triggered');
    return scanJob;
  }

  /**
   * Returns all past scan jobs for a source, newest first.
   *
   * @param sourceId - Source UUID
   * @param userId   - Owner user UUID (ownership is verified)
   * @returns Array of scan jobs
   * @throws AppError(NOT_FOUND) if the source does not exist or belongs to another user
   */
  @Trace({ name: 'files.getScanHistory' })
  async getScanHistory(sourceId: string, userId: string): Promise<KmsScanJob[]> {
    const source = await this.sourceRepository.findByIdAndUserId(sourceId, userId);
    if (!source) throw ErrorFactory.notFound('Source', sourceId);
    return this.scanJobRepository.findBySourceId(sourceId, userId);
  }
}
