import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/**
 * SourcesService handles all business logic for knowledge source management.
 *
 * A "source" represents an external data origin that the KMS ingests content
 * from — e.g. a local folder, Google Drive workspace, or S3 bucket.
 *
 * All methods are stubs pending full implementation. They throw a
 * `NOT_IMPLEMENTED` AppError so callers receive a consistent structured
 * error response during the development phase.
 */
@Injectable()
export class SourcesService {
  private readonly logger: AppLogger;

  constructor(
    private readonly prisma: PrismaService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: SourcesService.name });
  }

  /**
   * Returns a paginated list of all sources for the authenticated user.
   *
   * @returns Promise resolving to an array of source records.
   * @todo Implement with Prisma query + pagination
   */
  async findAll(): Promise<unknown[]> {
    this.logger.info('findAll sources — TODO');
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'SourcesService.findAll is not yet implemented',
    });
  }

  /**
   * Returns a single source by ID.
   *
   * @param id - The UUID of the source to retrieve.
   * @returns Promise resolving to the source record.
   * @todo Implement with Prisma findUniqueOrThrow
   */
  async findOne(id: string): Promise<unknown> {
    this.logger.info('findOne source — TODO', { sourceId: id });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'SourcesService.findOne is not yet implemented',
    });
  }

  /**
   * Creates a new knowledge source.
   *
   * @param createDto - Data transfer object containing source creation fields.
   * @returns Promise resolving to the newly created source record.
   * @todo Implement with Prisma create + publish scan job to kms.scan queue
   */
  async create(createDto: Record<string, unknown>): Promise<unknown> {
    this.logger.info('create source — TODO', { dto: createDto });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'SourcesService.create is not yet implemented',
    });
  }

  /**
   * Updates an existing source by ID.
   *
   * @param id - The UUID of the source to update.
   * @param updateDto - Partial data to merge into the existing source.
   * @returns Promise resolving to the updated source record.
   * @todo Implement with Prisma update
   */
  async update(id: string, updateDto: Record<string, unknown>): Promise<unknown> {
    this.logger.info('update source — TODO', { sourceId: id, dto: updateDto });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'SourcesService.update is not yet implemented',
    });
  }

  /**
   * Soft-deletes a source and cascades to its associated files.
   *
   * @param id - The UUID of the source to delete.
   * @returns Promise resolving to void on success.
   * @todo Implement with Prisma delete + cascade logic
   */
  async remove(id: string): Promise<void> {
    this.logger.info('remove source — TODO', { sourceId: id });
    throw new AppError({
      code: ERROR_CODES.GEN.NOT_IMPLEMENTED.code,
      message: 'SourcesService.remove is not yet implemented',
    });
  }
}
