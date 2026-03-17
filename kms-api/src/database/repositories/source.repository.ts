import { Injectable } from '@nestjs/common';
import { Prisma, KmsSource, SourceStatus, SourceType } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for KmsSource entity operations.
 * Provides multi-tenant isolation by scoping all queries to userId.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SourcesService {
 *   constructor(private readonly sourceRepository: SourceRepository) {}
 *
 *   async getUserSources(userId: string) {
 *     return this.sourceRepository.findByUserId(userId);
 *   }
 * }
 * ```
 */
@Injectable()
export class SourceRepository extends BaseRepository<
  KmsSource,
  Prisma.KmsSourceCreateInput,
  Prisma.KmsSourceUpdateInput,
  Prisma.KmsSourceWhereInput,
  Prisma.KmsSourceWhereUniqueInput,
  Prisma.KmsSourceOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'kmsSource');
  }

  /**
   * Finds all sources belonging to a user
   * @param userId - The user ID for multi-tenant isolation
   * @returns Array of sources owned by the user
   */
  async findByUserId(userId: string): Promise<KmsSource[]> {
    return this.findMany({ userId }, { createdAt: 'desc' });
  }

  /**
   * Finds sources by user and status
   * @param userId - The user ID for multi-tenant isolation
   * @param status - The source status to filter by
   * @returns Array of matching sources
   */
  async findByUserIdAndStatus(userId: string, status: SourceStatus): Promise<KmsSource[]> {
    return this.findMany({ userId, status }, { createdAt: 'desc' });
  }

  /**
   * Finds sources by user and type
   * @param userId - The user ID for multi-tenant isolation
   * @param type - The source type to filter by
   * @returns Array of matching sources
   */
  async findByUserIdAndType(userId: string, type: SourceType): Promise<KmsSource[]> {
    return this.findMany({ userId, type }, { createdAt: 'desc' });
  }

  /**
   * Finds a source by external ID (e.g. Google Drive root folder ID)
   * @param externalId - The external platform identifier
   * @param userId - The user ID for multi-tenant isolation
   * @returns The source or null if not found
   */
  async findByExternalId(externalId: string, userId: string): Promise<KmsSource | null> {
    return this.findFirst({ externalId, userId });
  }

  /**
   * Updates the sync timestamp and status for a source
   * @param sourceId - The source ID
   * @param status - The new status to set
   * @returns The updated source
   */
  async updateSyncStatus(sourceId: string, status: SourceStatus): Promise<KmsSource> {
    return this.update(
      { id: sourceId },
      {
        status,
        lastSyncedAt: new Date(),
        lastScannedAt: new Date(),
      },
    );
  }

  /**
   * Updates encrypted OAuth tokens for a source
   * @param sourceId - The source ID
   * @param encryptedTokens - The encrypted token payload
   * @returns The updated source
   */
  async updateTokens(sourceId: string, encryptedTokens: string): Promise<KmsSource> {
    return this.update({ id: sourceId }, { encryptedTokens, status: SourceStatus.CONNECTED });
  }

  /**
   * Finds a source by ID scoped to a specific user — avoids cross-user access.
   * @param id - Source UUID
   * @param userId - Owner user UUID
   * @returns The source or null if not found / wrong owner
   */
  async findByIdAndUserId(id: string, userId: string): Promise<KmsSource | null> {
    return this.findFirst({ id, userId });
  }

  /**
   * Sets a source status to DISCONNECTED.
   * @param id - Source UUID
   * @returns Updated KmsSource
   */
  async disconnect(id: string): Promise<KmsSource> {
    return this.update({ id }, { status: SourceStatus.DISCONNECTED });
  }
}
