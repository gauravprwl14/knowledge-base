import { Injectable } from '@nestjs/common';
import { Prisma, ApiKey, ApiKeyStatus } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for ApiKey entity operations.
 * Extends BaseRepository with API key-specific methods.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class ApiKeyService {
 *   constructor(private readonly apiKeyRepository: ApiKeyRepository) {}
 *
 *   async validateKey(keyHash: string) {
 *     return this.apiKeyRepository.findActiveByHash(keyHash);
 *   }
 * }
 * ```
 */
@Injectable()
export class ApiKeyRepository extends BaseRepository<
  ApiKey,
  Prisma.ApiKeyCreateInput,
  Prisma.ApiKeyUpdateInput,
  Prisma.ApiKeyWhereInput,
  Prisma.ApiKeyWhereUniqueInput,
  Prisma.ApiKeyOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'apiKey');
  }

  /**
   * Finds an active API key by its hash
   * @param keyHash - The SHA-256 hash of the API key
   * @returns The API key with user or null
   */
  async findActiveByHash(
    keyHash: string,
  ): Promise<(ApiKey & { user: { id: string; email: string; role: string; status: string } }) | null> {
    return this.prisma.apiKey.findFirst({
      where: {
        keyHash,
        status: ApiKeyStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Finds an API key by its prefix
   * @param keyPrefix - The first 8-12 characters of the key
   * @returns Array of matching API keys
   */
  async findByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    return this.findMany({ keyPrefix });
  }

  /**
   * Finds all API keys for a user
   * @param userId - The user ID
   * @param includeRevoked - Whether to include revoked keys
   * @returns Array of API keys
   */
  async findByUserId(userId: string, includeRevoked: boolean = false): Promise<ApiKey[]> {
    return this.findMany(
      {
        userId,
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      { createdAt: 'desc' },
    );
  }

  /**
   * Updates the last used timestamp and increments usage count
   * @param keyId - The API key ID
   * @param ipAddress - The IP address of the request
   * @returns The updated API key
   */
  async recordUsage(keyId: string, ipAddress?: string): Promise<ApiKey> {
    return this.update(
      { id: keyId },
      {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
        ...(ipAddress && { lastUsedIp: ipAddress }),
      },
    );
  }

  /**
   * Revokes an API key
   * @param keyId - The API key ID
   * @returns The revoked API key
   */
  async revoke(keyId: string): Promise<ApiKey> {
    this.logger.debug(`Revoking API key`, { keyId });
    return this.update(
      { id: keyId },
      {
        status: ApiKeyStatus.REVOKED,
        revokedAt: new Date(),
      },
    );
  }

  /**
   * Revokes all API keys for a user
   * @param userId - The user ID
   * @returns Count of revoked keys
   */
  async revokeAllForUser(userId: string): Promise<{ count: number }> {
    this.logger.debug(`Revoking all API keys for user`, { userId });
    return this.updateMany(
      {
        userId,
        status: ApiKeyStatus.ACTIVE,
      },
      {
        status: ApiKeyStatus.REVOKED,
        revokedAt: new Date(),
      },
    );
  }

  /**
   * Finds expired API keys that need status update
   * @returns Array of expired keys
   */
  async findExpired(): Promise<ApiKey[]> {
    return this.findMany({
      status: ApiKeyStatus.ACTIVE,
      expiresAt: { lte: new Date() },
    });
  }

  /**
   * Marks expired keys as expired
   * @returns Count of updated keys
   */
  async markExpiredKeys(): Promise<{ count: number }> {
    return this.updateMany(
      {
        status: ApiKeyStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      { status: ApiKeyStatus.EXPIRED },
    );
  }

  /**
   * Gets usage statistics for an API key
   * @param keyId - The API key ID
   * @returns Usage statistics
   */
  async getUsageStats(keyId: string): Promise<{
    usageCount: number;
    lastUsedAt: Date | null;
    createdAt: Date;
    daysActive: number;
  } | null> {
    const key = await this.findUnique({ id: keyId });
    if (!key) return null;

    const now = new Date();
    const daysActive = Math.floor(
      (now.getTime() - key.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      usageCount: key.usageCount,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
      daysActive,
    };
  }

  /**
   * Checks if a user has reached their API key limit
   * @param userId - The user ID
   * @param maxKeys - Maximum allowed keys
   * @returns true if limit reached
   */
  async hasReachedKeyLimit(userId: string, maxKeys: number = 10): Promise<boolean> {
    const count = await this.count({
      userId,
      status: ApiKeyStatus.ACTIVE,
    });
    return count >= maxKeys;
  }

  /**
   * Finds API keys that haven't been used in a specified number of days
   * @param days - Number of days of inactivity
   * @returns Array of inactive keys
   */
  async findInactiveKeys(days: number): Promise<ApiKey[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.findMany({
      status: ApiKeyStatus.ACTIVE,
      OR: [
        { lastUsedAt: { lt: cutoffDate } },
        { lastUsedAt: null, createdAt: { lt: cutoffDate } },
      ],
    });
  }
}
