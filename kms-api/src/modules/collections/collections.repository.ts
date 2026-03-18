import { Injectable } from '@nestjs/common';
import { KmsCollection, KmsCollectionFile } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

/**
 * Data access layer for KmsCollection and KmsCollectionFile entities.
 *
 * Every query is scoped to `userId` for multi-tenant isolation.
 * Services should never access PrismaService directly for collection data —
 * use this repository instead.
 *
 * @example
 * ```typescript
 * const collections = await this.collectionsRepository.findAll(userId);
 * ```
 */
@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all collections owned by the given user.
   *
   * @param userId - Owner user UUID.
   * @returns Array of collection records ordered by creation date descending.
   */
  async findAll(userId: string): Promise<KmsCollection[]> {
    return this.prisma.kmsCollection.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a single collection by ID scoped to the given user.
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID.
   * @returns The matching collection or null when not found.
   */
  async findById(id: string, userId: string): Promise<KmsCollection | null> {
    return this.prisma.kmsCollection.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Creates a new collection for the given user.
   *
   * @param userId - Owner user UUID.
   * @param data - Collection creation payload (name and optional fields).
   * @returns The newly created collection record.
   */
  async create(
    userId: string,
    data: { name: string; description?: string; color?: string; icon?: string },
  ): Promise<KmsCollection> {
    return this.prisma.kmsCollection.create({
      data: {
        userId,
        name: data.name,
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  /**
   * Partially updates a collection owned by the given user.
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID (ownership verified before calling).
   * @param data - Fields to update.
   * @returns The updated collection record.
   */
  async update(
    id: string,
    userId: string,
    data: { name?: string; description?: string; color?: string; icon?: string },
  ): Promise<KmsCollection> {
    return this.prisma.kmsCollection.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  /**
   * Deletes a collection and all its file membership records (cascade).
   *
   * @param id - Collection UUID.
   * @param userId - Owner user UUID (ownership verified before calling).
   */
  async delete(id: string, userId: string): Promise<void> {
    await this.prisma.kmsCollection.delete({ where: { id } });
  }

  /**
   * Creates junction records linking a set of files to a collection.
   *
   * Skips existing pairs silently via `skipDuplicates`.
   *
   * @param collectionId - Collection UUID.
   * @param userId - Owner user UUID (files must belong to this user).
   * @param fileIds - Array of file UUIDs to add.
   */
  async addFiles(collectionId: string, userId: string, fileIds: string[]): Promise<void> {
    await this.prisma.kmsCollectionFile.createMany({
      data: fileIds.map((fileId) => ({ collectionId, fileId })),
      skipDuplicates: true,
    });
  }

  /**
   * Removes a single file from a collection.
   *
   * @param collectionId - Collection UUID.
   * @param userId - Owner user UUID (ownership verified before calling).
   * @param fileId - File UUID to remove.
   */
  async removeFile(collectionId: string, userId: string, fileId: string): Promise<void> {
    await this.prisma.kmsCollectionFile.deleteMany({
      where: { collectionId, fileId },
    });
  }

  /**
   * Returns the number of files currently in a collection.
   *
   * @param collectionId - Collection UUID.
   * @returns File count.
   */
  async getFileCount(collectionId: string): Promise<number> {
    return this.prisma.kmsCollectionFile.count({ where: { collectionId } });
  }

  /**
   * Returns all file IDs in a collection.
   *
   * @param collectionId - Collection UUID.
   * @returns Array of KmsCollectionFile records.
   */
  async findFiles(collectionId: string): Promise<KmsCollectionFile[]> {
    return this.prisma.kmsCollectionFile.findMany({ where: { collectionId } });
  }
}
