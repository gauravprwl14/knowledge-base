import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pagination parameters for list queries
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Base repository class providing common CRUD operations.
 * All entity-specific repositories should extend this class.
 *
 * @template T - The entity type
 * @template CreateInput - The create input type
 * @template UpdateInput - The update input type
 * @template WhereInput - The where clause type
 * @template WhereUniqueInput - The unique where clause type
 * @template OrderByInput - The order by type
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UserRepository extends BaseRepository<
 *   User,
 *   Prisma.UserCreateInput,
 *   Prisma.UserUpdateInput,
 *   Prisma.UserWhereInput,
 *   Prisma.UserWhereUniqueInput,
 *   Prisma.UserOrderByWithRelationInput
 * > {
 *   constructor(prisma: PrismaService) {
 *     super(prisma, 'user');
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<
  T,
  CreateInput,
  UpdateInput,
  WhereInput,
  WhereUniqueInput,
  OrderByInput,
> {
  protected readonly logger: Logger;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
  ) {
    this.logger = new Logger(`${modelName}Repository`);
  }

  /**
   * Gets the Prisma delegate for this model
   */
  protected get delegate(): any {
    return (this.prisma as any)[this.modelName];
  }

  /**
   * Creates a new entity
   * @param data - The data to create the entity with
   * @returns The created entity
   */
  async create(data: CreateInput): Promise<T> {
    this.logger.debug(`Creating ${this.modelName}`, { data });
    return this.delegate.create({ data });
  }

  /**
   * Creates multiple entities
   * @param data - Array of data to create entities with
   * @returns Count of created entities
   */
  async createMany(data: CreateInput[]): Promise<{ count: number }> {
    this.logger.debug(`Creating multiple ${this.modelName}s`, { count: data.length });
    return this.delegate.createMany({ data });
  }

  /**
   * Finds a single entity by unique identifier
   * @param where - The unique where clause
   * @returns The found entity or null
   */
  async findUnique(where: WhereUniqueInput): Promise<T | null> {
    return this.delegate.findUnique({ where });
  }

  /**
   * Finds a single entity by unique identifier or throws
   * @param where - The unique where clause
   * @returns The found entity
   * @throws NotFoundError if entity not found
   */
  async findUniqueOrThrow(where: WhereUniqueInput): Promise<T> {
    return this.delegate.findUniqueOrThrow({ where });
  }

  /**
   * Finds the first entity matching the criteria
   * @param where - The where clause
   * @param orderBy - The order by clause
   * @returns The found entity or null
   */
  async findFirst(where?: WhereInput, orderBy?: OrderByInput): Promise<T | null> {
    return this.delegate.findFirst({ where, orderBy });
  }

  /**
   * Finds all entities matching the criteria
   * @param where - The where clause
   * @param orderBy - The order by clause
   * @returns Array of found entities
   */
  async findMany(where?: WhereInput, orderBy?: OrderByInput): Promise<T[]> {
    return this.delegate.findMany({ where, orderBy });
  }

  /**
   * Finds entities with pagination
   * @param params - Pagination parameters
   * @param where - The where clause
   * @returns Paginated result
   */
  async findManyPaginated(
    params: PaginationParams,
    where?: WhereInput,
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 10));
    const skip = (page - 1) * limit;

    const orderBy = params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'desc' }
      : { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      this.delegate.findMany({
        where,
        orderBy,
        skip,
        take: limit,
      }),
      this.delegate.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Updates an entity by unique identifier
   * @param where - The unique where clause
   * @param data - The data to update
   * @returns The updated entity
   */
  async update(where: WhereUniqueInput, data: UpdateInput): Promise<T> {
    this.logger.debug(`Updating ${this.modelName}`, { where, data });
    return this.delegate.update({ where, data });
  }

  /**
   * Updates multiple entities
   * @param where - The where clause
   * @param data - The data to update
   * @returns Count of updated entities
   */
  async updateMany(where: WhereInput, data: UpdateInput): Promise<{ count: number }> {
    this.logger.debug(`Updating multiple ${this.modelName}s`, { where, data });
    return this.delegate.updateMany({ where, data });
  }

  /**
   * Creates or updates an entity
   * @param where - The unique where clause
   * @param create - Data for creation
   * @param update - Data for update
   * @returns The created or updated entity
   */
  async upsert(where: WhereUniqueInput, create: CreateInput, update: UpdateInput): Promise<T> {
    this.logger.debug(`Upserting ${this.modelName}`, { where });
    return this.delegate.upsert({ where, create, update });
  }

  /**
   * Deletes an entity by unique identifier
   * @param where - The unique where clause
   * @returns The deleted entity
   */
  async delete(where: WhereUniqueInput): Promise<T> {
    this.logger.debug(`Deleting ${this.modelName}`, { where });
    return this.delegate.delete({ where });
  }

  /**
   * Deletes multiple entities
   * @param where - The where clause
   * @returns Count of deleted entities
   */
  async deleteMany(where: WhereInput): Promise<{ count: number }> {
    this.logger.debug(`Deleting multiple ${this.modelName}s`, { where });
    return this.delegate.deleteMany({ where });
  }

  /**
   * Counts entities matching the criteria
   * @param where - The where clause
   * @returns Count of matching entities
   */
  async count(where?: WhereInput): Promise<number> {
    return this.delegate.count({ where });
  }

  /**
   * Checks if an entity exists
   * @param where - The where clause
   * @returns true if entity exists
   */
  async exists(where: WhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }

  /**
   * Soft deletes an entity (sets deletedAt timestamp)
   * Assumes the model has a deletedAt field
   * @param where - The unique where clause
   * @returns The soft deleted entity
   */
  async softDelete(where: WhereUniqueInput): Promise<T> {
    this.logger.debug(`Soft deleting ${this.modelName}`, { where });
    return this.delegate.update({
      where,
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Restores a soft deleted entity
   * @param where - The unique where clause
   * @returns The restored entity
   */
  async restore(where: WhereUniqueInput): Promise<T> {
    this.logger.debug(`Restoring ${this.modelName}`, { where });
    return this.delegate.update({
      where,
      data: { deletedAt: null },
    });
  }
}
