import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { FileRepository, ListFilesParams, FilesPage } from '../../database/repositories/file.repository';

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
   * Hard-deletes a file and returns a confirmation flag.
   *
   * Verifies ownership first; throws FILE_NOT_FOUND if the file does not
   * belong to `userId`. Cascade rules in the schema remove related chunks,
   * collection memberships, and file-tag rows automatically.
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

    // Hard-delete the file; cascade handles related rows
    await this.fileRepo.deleteById(id);

    this.logger.info('file deleted', { fileId: id, userId });
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
}
