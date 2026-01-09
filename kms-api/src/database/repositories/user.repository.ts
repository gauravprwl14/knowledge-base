import { Injectable } from '@nestjs/common';
import { Prisma, User, UserStatus, UserRole } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Repository for User entity operations.
 * Extends BaseRepository with User-specific methods.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   constructor(private readonly userRepository: UserRepository) {}
 *
 *   async getUserByEmail(email: string) {
 *     return this.userRepository.findByEmail(email);
 *   }
 * }
 * ```
 */
@Injectable()
export class UserRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput,
  Prisma.UserWhereUniqueInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'user');
  }

  /**
   * Finds a user by email address
   * @param email - The email address to search for
   * @returns The user or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findFirst({ email: email.toLowerCase() });
  }

  /**
   * Finds active users by role
   * @param role - The role to filter by
   * @returns Array of active users with the specified role
   */
  async findActiveByRole(role: UserRole): Promise<User[]> {
    return this.findMany(
      {
        role,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      { createdAt: 'desc' },
    );
  }

  /**
   * Updates the last login timestamp and resets failed login count
   * @param userId - The user ID
   * @returns The updated user
   */
  async updateLastLogin(userId: string): Promise<User> {
    return this.update(
      { id: userId },
      {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    );
  }

  /**
   * Increments the failed login count and optionally locks the account
   * @param userId - The user ID
   * @param lockDurationMinutes - Duration to lock account (0 = no lock)
   * @returns The updated user
   */
  async incrementFailedLogin(userId: string, lockDurationMinutes: number = 0): Promise<User> {
    const lockUntil =
      lockDurationMinutes > 0
        ? new Date(Date.now() + lockDurationMinutes * 60 * 1000)
        : undefined;

    return this.update(
      { id: userId },
      {
        failedLoginCount: { increment: 1 },
        ...(lockUntil && { lockedUntil: lockUntil }),
      },
    );
  }

  /**
   * Verifies a user's email address
   * @param userId - The user ID
   * @returns The updated user
   */
  async verifyEmail(userId: string): Promise<User> {
    return this.update(
      { id: userId },
      {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    );
  }

  /**
   * Updates user status
   * @param userId - The user ID
   * @param status - The new status
   * @returns The updated user
   */
  async updateStatus(userId: string, status: UserStatus): Promise<User> {
    return this.update({ id: userId }, { status });
  }

  /**
   * Finds users with expired locks that should be unlocked
   * @returns Array of users with expired locks
   */
  async findUsersWithExpiredLocks(): Promise<User[]> {
    return this.findMany({
      lockedUntil: { lte: new Date() },
      status: UserStatus.ACTIVE,
    });
  }

  /**
   * Finds a user with their API keys
   * @param userId - The user ID
   * @returns The user with API keys or null
   */
  async findWithApiKeys(userId: string): Promise<(User & { apiKeys: any[] }) | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Searches users by email or name
   * @param query - The search query
   * @param limit - Maximum results to return
   * @returns Array of matching users
   */
  async search(query: string, limit: number = 10): Promise<User[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query.toLowerCase() } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
        deletedAt: null,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Counts users by status
   * @returns Object with counts per status
   */
  async countByStatus(): Promise<Record<UserStatus, number>> {
    const results = await this.prisma.user.groupBy({
      by: ['status'],
      _count: { status: true },
      where: { deletedAt: null },
    });

    const counts: Record<UserStatus, number> = {
      [UserStatus.ACTIVE]: 0,
      [UserStatus.INACTIVE]: 0,
      [UserStatus.SUSPENDED]: 0,
      [UserStatus.PENDING_VERIFICATION]: 0,
    };

    for (const result of results) {
      counts[result.status] = result._count.status;
    }

    return counts;
  }
}
