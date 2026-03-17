import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/**
 * FilesService handles all business logic for KMS file management.
 *
 * Files represent individual documents (PDFs, Markdown files, etc.) that have
 * been discovered by the scan-worker and processed by the embed-worker.
 * They are stored in the `kms_files` table and indexed in Qdrant.
 *
 * All methods are stubs pending full implementation.
 */
@Injectable()
export class FilesService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: FilesService.name });
  }

  /**
   * Returns a paginated list of all KMS files visible to the caller.
   *
   * @returns Promise resolving to an array of file records.
   * @todo Implement with Prisma query + cursor-based pagination
   */
  async findAll(): Promise<unknown[]> {
    this.logger.info('findAll files — TODO');
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'FilesService.findAll is not yet implemented',
    });
  }

  /**
   * Returns a single KMS file by its UUID.
   *
   * @param id - The UUID of the file to retrieve.
   * @returns Promise resolving to the file record.
   * @todo Implement with Prisma findUniqueOrThrow
   */
  async findOne(id: string): Promise<unknown> {
    this.logger.info('findOne file — TODO', { fileId: id });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'FilesService.findOne is not yet implemented',
    });
  }

  /**
   * Soft-deletes a file and removes its embedding from Qdrant.
   *
   * @param id - The UUID of the file to delete.
   * @returns Promise resolving to void on success.
   * @todo Implement with Prisma soft-delete + Qdrant point removal
   */
  async remove(id: string): Promise<void> {
    this.logger.info('remove file — TODO', { fileId: id });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'FilesService.remove is not yet implemented',
    });
  }

  /**
   * Replaces the tags array on a file record.
   *
   * @param id - The UUID of the file to update.
   * @param tags - Array of tag strings to apply.
   * @returns Promise resolving to the updated file record.
   * @todo Implement with Prisma update
   */
  async updateTags(id: string, tags: string[]): Promise<unknown> {
    this.logger.info('updateTags file — TODO', { fileId: id, tags });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'FilesService.updateTags is not yet implemented',
    });
  }
}
