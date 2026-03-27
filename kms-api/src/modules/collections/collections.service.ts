import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CollectionsRepository } from './collections.repository';
import { ErrorFactory } from '../../errors/types/error-factory';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddFilesToCollectionDto } from './dto/add-files-to-collection.dto';
import { CollectionResponseDto } from './dto/collection-response.dto';

/**
 * CollectionsService handles all business logic for KMS collections.
 *
 * A collection is a named, user-owned grouping of files that can be used to
 * scope search queries or RAG context to a curated subset of the knowledge base.
 *
 * All methods are multi-tenant: every operation is scoped to `userId`.
 *
 * @example
 * ```typescript
 * const collections = await collectionsService.list(userId);
 * const collection  = await collectionsService.get(id, userId);
 * ```
 */
@Injectable()
export class CollectionsService {
  constructor(
    private readonly collectionsRepository: CollectionsRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(CollectionsService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Returns all collections owned by the authenticated user with computed file counts.
   *
   * @param userId - Owner user UUID.
   * @returns Array of collection response DTOs.
   */
  @Trace({ name: 'collections.list' })
  async list(userId: string): Promise<CollectionResponseDto[]> {
    this.logger.info({ userId }, 'Listing collections');
    const collections = await this.collectionsRepository.findAll(userId);

    const fileCounts = await Promise.all(
      collections.map((c) => this.collectionsRepository.getFileCount(c.id)),
    );

    return collections.map((collection, index) =>
      this._toDto(collection, fileCounts[index]),
    );
  }

  /**
   * Returns a single collection by ID scoped to the caller.
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID.
   * @returns Collection response DTO.
   * @throws AppError(NOT_FOUND) if the collection does not exist or belongs to another user.
   */
  @Trace({ name: 'collections.get' })
  async get(id: string, userId: string): Promise<CollectionResponseDto> {
    this.logger.info({ collectionId: id, userId }, 'Getting collection');
    const collection = await this.collectionsRepository.findById(id, userId);
    if (!collection) throw ErrorFactory.notFound('Collection', id);

    const fileCount = await this.collectionsRepository.getFileCount(id);
    return this._toDto(collection, fileCount);
  }

  /**
   * Creates a new collection for the authenticated user.
   *
   * @param userId - Owner user UUID.
   * @param dto - Collection creation payload.
   * @returns The created collection response DTO.
   */
  @Trace({ name: 'collections.create' })
  async create(userId: string, dto: CreateCollectionDto): Promise<CollectionResponseDto> {
    this.logger.info({ userId, name: dto.name }, 'Creating collection');
    const collection = await this.collectionsRepository.create(userId, dto);
    return this._toDto(collection, 0);
  }

  /**
   * Partially updates a collection owned by the caller.
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID.
   * @param dto - Partial update payload.
   * @returns The updated collection response DTO.
   * @throws AppError(NOT_FOUND) if the collection does not exist or belongs to another user.
   */
  @Trace({ name: 'collections.update' })
  async update(
    id: string,
    userId: string,
    dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    this.logger.info({ collectionId: id, userId }, 'Updating collection');
    const existing = await this.collectionsRepository.findById(id, userId);
    if (!existing) throw ErrorFactory.notFound('Collection', id);

    const updated = await this.collectionsRepository.update(id, userId, dto);
    const fileCount = await this.collectionsRepository.getFileCount(id);
    return this._toDto(updated, fileCount);
  }

  /**
   * Deletes a collection and all its file membership records.
   *
   * Default collections (isDefault = true) cannot be deleted.
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID.
   * @throws AppError(NOT_FOUND) if the collection does not exist or belongs to another user.
   * @throws AppError(CONFLICT) if the collection is marked as the default collection.
   */
  @Trace({ name: 'collections.delete' })
  async delete(id: string, userId: string): Promise<void> {
    this.logger.info({ collectionId: id, userId }, 'Deleting collection');
    const existing = await this.collectionsRepository.findById(id, userId);
    if (!existing) throw ErrorFactory.notFound('Collection', id);

    // isDefault is not yet a Prisma schema field — guard against future additions
    if ((existing as any).isDefault === true) {
      throw ErrorFactory.conflict('Cannot delete the default collection');
    }

    await this.collectionsRepository.delete(id, userId);
  }

  /**
   * Adds multiple files to a collection after validating ownership.
   *
   * All file UUIDs must belong to the authenticated user. Any file that
   * is already in the collection is silently skipped.
   *
   * @param collectionId - Collection UUID.
   * @param userId - Owner user UUID.
   * @param dto - Payload containing the array of file UUIDs to add.
   * @throws AppError(NOT_FOUND) if the collection does not exist or belongs to another user.
   * @throws AppError(NOT_FOUND) if any of the provided file IDs do not exist for the user.
   */
  @Trace({ name: 'collections.addFiles' })
  async addFiles(
    collectionId: string,
    userId: string,
    dto: AddFilesToCollectionDto,
  ): Promise<void> {
    this.logger.info(
      { collectionId, userId, fileCount: dto.fileIds.length },
      'Adding files to collection',
    );

    const collection = await this.collectionsRepository.findById(collectionId, userId);
    if (!collection) throw ErrorFactory.notFound('Collection', collectionId);

    if (dto.fileIds.length > 0) {
      // Validate that all file IDs exist and belong to the user
      const existingFiles = await this.prisma.kmsFile.findMany({
        where: { id: { in: dto.fileIds }, userId },
        select: { id: true },
      });

      if (existingFiles.length !== dto.fileIds.length) {
        const foundIds = new Set(existingFiles.map((f) => f.id));
        const missingId = dto.fileIds.find((id) => !foundIds.has(id));
        throw ErrorFactory.notFound('File', missingId);
      }

      await this.collectionsRepository.addFiles(collectionId, userId, dto.fileIds);
    }
  }

  /**
   * Removes a single file from a collection.
   *
   * @param collectionId - Collection UUID.
   * @param userId - Owner user UUID.
   * @param fileId - File UUID to remove.
   * @throws AppError(NOT_FOUND) if the collection does not exist or belongs to another user.
   */
  @Trace({ name: 'collections.removeFile' })
  async removeFile(collectionId: string, userId: string, fileId: string): Promise<void> {
    this.logger.info({ collectionId, userId, fileId }, 'Removing file from collection');

    const collection = await this.collectionsRepository.findById(collectionId, userId);
    if (!collection) throw ErrorFactory.notFound('Collection', collectionId);

    await this.collectionsRepository.removeFile(collectionId, userId, fileId);
  }

  /**
   * Maps a Prisma KmsCollection record to the public response DTO.
   *
   * @param collection - Raw Prisma collection record.
   * @param fileCount - Computed file count for this collection.
   * @returns CollectionResponseDto.
   */
  private _toDto(collection: any, fileCount: number): CollectionResponseDto {
    const dto = new CollectionResponseDto();
    dto.id = collection.id;
    dto.name = collection.name;
    dto.description = collection.description ?? undefined;
    dto.color = collection.color ?? undefined;
    dto.icon = collection.icon ?? undefined;
    dto.isDefault = collection.isDefault ?? false;
    dto.fileCount = fileCount;
    dto.createdAt = collection.createdAt;
    dto.updatedAt = collection.updatedAt;
    return dto;
  }
}
