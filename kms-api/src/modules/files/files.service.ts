import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { Prisma, ScanJobType } from '@prisma/client';
import { FileRepository, ListFilesParams, FilesPage } from '../../database/repositories/file.repository';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmbedJobPublisher } from '../../queue/publishers/embed-job.publisher';
import { ScanJobPublisher } from '../../queue/publishers/scan-job.publisher';
import { IngestNoteDto } from './dto/ingest-note.dto';
import { MinioService } from './minio.service';

// ---------------------------------------------------------------------------
// DTOs / types
// ---------------------------------------------------------------------------

/** A single file within a duplicate group. */
export interface DuplicateFile {
  id: string;
  originalFilename: string;
  fileSize: number;
  sourceId: string;
  createdAt: string;
}

/** A group of files sharing the same SHA-256 checksum. */
export interface DuplicateGroup {
  /** SHA-256 hash shared by all files in this group. */
  checksum: string;
  /** Bytes that could be reclaimed by deleting the non-canonical duplicates. */
  totalWastedBytes: number;
  /** Files ordered oldest → newest; the first entry is the canonical "keep" file. */
  files: DuplicateFile[];
}

/**
 * FilesService — business logic for KMS file management.
 *
 * Files represent individual documents (PDFs, Markdown files, etc.) that have
 * been discovered by the scan-worker and processed by the embed-worker.
 * They are stored in the `kms_files` table.
 *
 * All operations are scoped to the authenticated user's ID to enforce
 * multi-tenant isolation; cross-user access returns 404 rather than 403
 * to avoid leaking existence of resources.
 */
@Injectable()
export class FilesService {
  private readonly logger: AppLogger;

  constructor(
    private readonly fileRepo: FileRepository,
    logger: AppLogger,
    private readonly prisma: PrismaService,
    private readonly embedJobPublisher: EmbedJobPublisher,
    private readonly scanJobRepo: ScanJobRepository,
    private readonly scanJobPublisher: ScanJobPublisher,
    private readonly minioService: MinioService,
  ) {
    // Bind context name so every log line carries `context: FilesService`
    this.logger = logger.child({ context: FilesService.name });
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of files visible to `userId`.
   *
   * Supports filtering by sourceId, status, mimeGroup, collectionId,
   * tag names, and a filename search substring.
   *
   * @param params - Filter and pagination options.
   * @returns Paginated file list with a nextCursor for the following page.
   */
  async listFiles(params: ListFilesParams): Promise<FilesPage> {
    this.logger.info('listFiles', { userId: params.userId, limit: params.limit });
    return this.fileRepo.listFiles(params);
  }

  // ---------------------------------------------------------------------------
  // GET ONE
  // ---------------------------------------------------------------------------

  /**
   * Returns a single KMS file by its UUID.
   * Throws FILE_NOT_FOUND (404) if the file does not exist or belongs to a
   * different user.
   *
   * @param id - File UUID.
   * @param userId - Authenticated user UUID.
   * @returns The matching file record.
   */
  async findOne(id: string, userId: string): Promise<object> {
    // Scope lookup to user to prevent cross-tenant reads
    const file = await this.fileRepo.findByIdAndUserId(id, userId);
    if (!file) {
      throw new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
    }
    return file;
  }

  // ---------------------------------------------------------------------------
  // DELETE SINGLE
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes a file by setting its status to DELETED and recording a
   * `deleted_at` timestamp for the audit trail.
   *
   * Also deletes all associated `kms_chunks` rows so they no longer appear in
   * full-text search results.  Qdrant vector point cleanup is deferred — orphaned
   * vectors are purged in the background reset/clear flow (tracked in backlog).
   *
   * Verifies ownership first; throws FILE_NOT_FOUND if the file does not
   * belong to `userId` or does not exist.
   *
   * @param id - File UUID.
   * @param userId - Authenticated user UUID.
   * @returns `{ deleted: true }` on success.
   */
  async deleteFile(id: string, userId: string): Promise<{ deleted: boolean }> {
    // Verify ownership before deletion — returns 404 for both missing and foreign files
    const file = await this.fileRepo.findByIdAndUserId(id, userId);
    if (!file) {
      throw new AppError({ code: ERROR_CODES.FIL.FILE_NOT_FOUND.code });
    }

    // Delete associated chunks first (FK constraint: chunks reference files)
    await this.prisma.$executeRaw`
      DELETE FROM kms_chunks WHERE file_id = ${id}::uuid
    `;

    // Soft-delete the file record — keeps audit trail.
    // `deletedAt` and the DELETED status value are added by migration
    // 20260323000001_add_file_deleted_status; cast to `any` until Prisma
    // client is regenerated against the updated schema.
    await this.prisma.kmsFile.update({
      where: { id },
      data: {
        status: 'DELETED' as any,
        deletedAt: new Date() as any,
        updatedAt: new Date(),
      } as any,
    });

    this.logger.info('file soft-deleted', { fileId: id, userId });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------
  // BULK DELETE
  // ---------------------------------------------------------------------------

  /**
   * Bulk hard-deletes up to 100 files in a single query.
   * Only files owned by `userId` are affected; foreign IDs are silently ignored.
   *
   * @param ids - Array of file UUIDs (max 100).
   * @param userId - Authenticated user UUID.
   * @returns `{ deleted: N }` where N is the number of rows actually removed.
   */
  async bulkDeleteFiles(ids: string[], userId: string): Promise<{ deleted: number }> {
    const count = await this.fileRepo.bulkDelete(ids, userId);
    this.logger.info('files bulk deleted', { count, requested: ids.length, userId });
    return { deleted: count };
  }

  // ---------------------------------------------------------------------------
  // BULK MOVE
  // ---------------------------------------------------------------------------

  /**
   * Moves up to 100 files into a target collection by upserting join rows.
   * Only files owned by `userId` are moved; foreign IDs are silently ignored.
   *
   * @param fileIds - Array of file UUIDs (max 100).
   * @param collectionId - Target collection UUID.
   * @param userId - Authenticated user UUID.
   * @returns `{ moved: N }` where N is the number of new memberships created.
   */
  async bulkMoveFiles(
    fileIds: string[],
    collectionId: string,
    userId: string,
  ): Promise<{ moved: number }> {
    const count = await this.fileRepo.bulkMoveToCollection(fileIds, collectionId, userId);
    this.logger.info('files bulk moved', { count, collectionId, userId });
    return { moved: count };
  }

  // ---------------------------------------------------------------------------
  // TRIGGER SCAN
  // ---------------------------------------------------------------------------

  /**
   * Creates a KmsScanJob record and publishes it to the `kms.scan` queue.
   *
   * If a QUEUED or RUNNING job already exists for the source, the existing job
   * is returned without creating a duplicate.
   *
   * @param sourceId - Source UUID.
   * @param userId   - Authenticated user UUID.
   * @param scanType - 'FULL' | 'INCREMENTAL' (default: 'FULL').
   * @returns The new or existing KmsScanJob record.
   */
  async triggerScan(
    sourceId: string,
    userId: string,
    scanType: 'FULL' | 'INCREMENTAL' = 'FULL',
  ) {
    // Verify the source belongs to this user
    const source = await this.prisma.kmsSource.findFirst({ where: { id: sourceId, userId } });
    if (!source) {
      throw new AppError({ code: ERROR_CODES.DAT.NOT_FOUND.code });
    }

    // Return existing active job rather than creating a duplicate
    const existing = await this.scanJobRepo.findActiveBySourceId(sourceId, userId);
    if (existing) {
      this.logger.info('scan job already active — returning existing', { sourceId, jobId: existing.id, userId });
      return existing;
    }

    const job = await this.scanJobRepo.createJob(sourceId, userId, scanType as ScanJobType);

    await this.scanJobPublisher.publishScanJob({
      scan_job_id: job.id,
      source_id: sourceId,
      source_type: source.type.toLowerCase(),
      user_id: userId,
      scan_type: scanType,
      config: (source.configJson as Record<string, unknown>) ?? {},
    });

    this.logger.info('scan job created and published', { jobId: job.id, sourceId, scanType, userId });
    return job;
  }

  // ---------------------------------------------------------------------------
  // SCAN HISTORY
  // ---------------------------------------------------------------------------

  /**
   * Returns all scan jobs for a source, newest first.
   *
   * @param sourceId - Source UUID.
   * @param userId   - Authenticated user UUID.
   * @returns Array of KmsScanJob records.
   */
  async getScanHistory(sourceId: string, userId: string) {
    // Verify source ownership
    const source = await this.prisma.kmsSource.findFirst({ where: { id: sourceId, userId } });
    if (!source) {
      throw new AppError({ code: ERROR_CODES.DAT.NOT_FOUND.code });
    }

    return this.scanJobRepo.findBySourceId(sourceId, userId);
  }

  // ---------------------------------------------------------------------------
  // UPDATE TAGS (legacy patch endpoint — kept for backward compat)
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Use the TagsModule endpoints instead.
   * Stub — will be removed once the Tags module is integrated on the frontend.
   */
  async updateTags(id: string, tags: string[]): Promise<unknown> {
    this.logger.info('updateTags file — TODO', { fileId: id, tags });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'FilesService.updateTags — use TagsModule endpoints',
    });
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPTION STATUS
  // ---------------------------------------------------------------------------

  /**
   * Returns the most recent voice transcription job summary for a file.
   *
   * Only the job metadata is returned (no full transcript text) to keep
   * response payloads small.  The full transcript can be retrieved via a
   * dedicated transcript endpoint if needed.
   *
   * Returns `null` when no job exists for the file (e.g. the file is not
   * audio/video, the feature flag was off, or the job has not been created
   * yet).
   *
   * @param userId - Authenticated user UUID (for ownership scoping).
   * @param fileId - Target file UUID.
   * @returns The latest KmsVoiceJob summary or `null`.
   */
  async getTranscription(userId: string, fileId: string): Promise<object | null> {
    const job = await this.prisma.kmsVoiceJob.findFirst({
      where: { fileId, userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        language: true,
        durationSeconds: true,
        completedAt: true,
        errorMsg: true,
        modelUsed: true,
        createdAt: true,
        updatedAt: true,
        // transcript excluded intentionally — too large for summary response
      },
    });

    if (!job) return null;

    this.logger.info('transcription status fetched', { fileId, userId, status: job.status });
    return job;
  }

  // ---------------------------------------------------------------------------
  // DUPLICATE GROUPS
  // ---------------------------------------------------------------------------

  /**
   * Returns all duplicate file groups for a user, grouped by SHA-256 checksum.
   *
   * A group is only returned when at least two non-deleted files share the same
   * checksum. Within each group, files are ordered oldest → newest so the
   * caller can treat the first entry as the canonical "keep" file.
   *
   * `totalWastedBytes` is the sum of file sizes for all files except the oldest
   * (i.e. the bytes that could be reclaimed by deleting the duplicates).
   *
   * @param userId - Authenticated user UUID.
   * @returns Array of duplicate groups, each with the shared checksum, wasted
   *   bytes, and the list of matching files.
   */
  async getDuplicateGroups(userId: string): Promise<DuplicateGroup[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      checksum: string;
      file_ids: string;
      file_names: string;
      file_sizes: string;
      source_ids: string;
      created_ats: string;
    }>>`
      SELECT
        d.checksum_sha256                                              AS checksum,
        string_agg(f.id::text,           ',' ORDER BY f.created_at)  AS file_ids,
        string_agg(f.file_name,          '|||' ORDER BY f.created_at) AS file_names,
        string_agg(f.file_size_bytes::text, ',' ORDER BY f.created_at) AS file_sizes,
        string_agg(f.source_id::text,    ',' ORDER BY f.created_at)  AS source_ids,
        string_agg(f.created_at::text,   ',' ORDER BY f.created_at)  AS created_ats
      FROM kms_file_duplicates d
      JOIN kms_files f ON f.id = d.file_id
      WHERE d.user_id = ${userId}::uuid
        AND f.status != 'DELETED'
      GROUP BY d.checksum_sha256
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    this.logger.info('getDuplicateGroups', { userId, count: rows.length });

    return rows.map((row) => {
      const ids      = row.file_ids.split(',');
      const names    = row.file_names.split('|||');
      const sizes    = row.file_sizes.split(',');
      const sourceIds = row.source_ids.split(',');
      const dates    = row.created_ats.split(',');

      // Sum of sizes for all files except the canonical (index 0, the oldest)
      const totalWastedBytes = ids
        .slice(1)
        .reduce((sum, _, i) => sum + parseInt(sizes[i + 1] ?? '0', 10), 0);

      return {
        checksum: row.checksum,
        totalWastedBytes,
        files: ids.map((id, i) => ({
          id,
          originalFilename: names[i] ?? '',
          fileSize: parseInt(sizes[i] ?? '0', 10),
          sourceId: sourceIds[i] ?? '',
          createdAt: dates[i] ?? '',
        })),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // INGEST (Obsidian plugin direct push)
  // ---------------------------------------------------------------------------

  /**
   * Ingests an Obsidian note directly into the KMS indexing pipeline.
   *
   * Upserts an OBSIDIAN source for the user, creates a `kms_files` row, and
   * publishes an embed job message directly to `kms.embed` so the note is
   * embedded without going through the scan-worker file-discovery stage.
   *
   * The note content is carried in the `inline_content` field of the embed
   * message, which tells the embed-worker to skip the disk-read step.
   *
   * @param dto - Validated ingest request body.
   * @param userId - Authenticated user UUID (from JWT).
   * @returns An object containing the new file UUID and the Obsidian source UUID.
   * @throws AppError with `GEN.INTERNAL_ERROR` if publishing to RabbitMQ fails.
   */
  async ingestNote(
    dto: IngestNoteDto,
    userId: string,
  ): Promise<{ fileId: string; sourceId: string }> {
    // ── Step 1: Upsert the OBSIDIAN source for this user ───────────────────
    let obsidianSource = await this.prisma.kmsSource.findFirst({
      where: { userId, type: 'OBSIDIAN' },
    });

    if (!obsidianSource) {
      obsidianSource = await this.prisma.kmsSource.create({
        data: {
          userId,
          type: 'OBSIDIAN',
          name: 'Obsidian Vault',
          status: 'IDLE',
        },
      });
    }

    // ── Step 2: Derive filename and size ───────────────────────────────────
    const name = dto.title.endsWith('.md') ? dto.title : `${dto.title}.md`;
    const filePath = dto.path ?? dto.title;
    const sizeBytes = Buffer.byteLength(dto.content, 'utf8');
    const fileId = randomUUID();

    // ── Step 3: Create the kms_files row ───────────────────────────────────
    await this.prisma.kmsFile.create({
      data: {
        id: fileId,
        userId,
        sourceId: obsidianSource.id,
        name,
        path: filePath,
        mimeType: 'text/markdown',
        sizeBytes: BigInt(sizeBytes),
        status: 'PENDING',
        metadata: { source: 'obsidian' } as Prisma.InputJsonValue,
      },
    });

    // ── Step 4: Publish embed job message to kms.embed ─────────────────────
    try {
      await this.embedJobPublisher.publishEmbedJob({
        scan_job_id: fileId,
        source_id: obsidianSource.id,
        user_id: userId,
        file_path: `obsidian://${filePath}`,
        original_filename: name,
        mime_type: 'text/markdown',
        file_size_bytes: sizeBytes,
        source_type: 'obsidian',
        source_metadata: {},
        inline_content: dto.content,
      });
    } catch (err) {
      this.logger.error('Failed to publish embed job for Obsidian ingest', {
        fileId,
        userId,
        error: String(err),
      });
      throw new AppError({
        code: ERROR_CODES.GEN.INTERNAL_ERROR.code,
        message: 'Failed to queue note for indexing',
        cause: err instanceof Error ? err : undefined,
      });
    }

    // ── Step 5: Log success ────────────────────────────────────────────────
    this.logger.info('file ingested from obsidian', { fileId, userId });

    return { fileId, sourceId: obsidianSource.id };
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPT PRE-SIGNED URL
  // ---------------------------------------------------------------------------

  /**
   * Returns a pre-signed URL for the transcript of the given file.
   *
   * Looks up the most recent COMPLETED voice job for the file and generates
   * a 15-minute pre-signed GET URL from MinIO.  Returns `null` when no
   * completed transcript exists or when `transcript_path` is not set on the job.
   *
   * @param userId - Authenticated user UUID (for ownership scoping).
   * @param fileId - Target file UUID.
   * @returns An object with the pre-signed `url`, or `null`.
   */
  async getTranscriptUrl(userId: string, fileId: string): Promise<{ url: string } | null> {
    type Row = { id: string; transcript_path: string | null };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, transcript_path
      FROM   kms_voice_jobs
      WHERE  file_id = ${fileId}::uuid
        AND  user_id = ${userId}::uuid
        AND  status  = 'COMPLETED'
      ORDER  BY created_at DESC
      LIMIT  1
    `;

    if (!rows.length || !rows[0].transcript_path) return null;

    const url = await this.minioService.getPresignedUrl(rows[0].transcript_path);
    this.logger.info('transcript presigned url generated', { fileId, userId, objectKey: rows[0].transcript_path });
    return { url };
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPT RAW TEXT
  // ---------------------------------------------------------------------------

  /**
   * Returns the raw transcript text for the given file by fetching it from MinIO.
   *
   * Looks up the most recent COMPLETED voice job; returns `null` when no
   * transcript path is available.
   *
   * @param userId - Authenticated user UUID (for ownership scoping).
   * @param fileId - Target file UUID.
   * @returns An object with the raw `text`, or `null`.
   */
  async getTranscriptText(userId: string, fileId: string): Promise<{ text: string } | null> {
    type Row = { id: string; transcript_path: string | null };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT id, transcript_path
      FROM   kms_voice_jobs
      WHERE  file_id = ${fileId}::uuid
        AND  user_id = ${userId}::uuid
        AND  status  = 'COMPLETED'
      ORDER  BY created_at DESC
      LIMIT  1
    `;

    if (!rows.length || !rows[0].transcript_path) return null;

    const text = await this.minioService.getTranscriptText(rows[0].transcript_path);
    this.logger.info('transcript text fetched from minio', { fileId, userId, objectKey: rows[0].transcript_path, chars: text.length });
    return { text };
  }
}
