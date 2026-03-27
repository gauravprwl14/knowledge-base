import { Injectable } from '@nestjs/common';
import { Prisma, AuditLog } from '@prisma/client';
import { BaseRepository, PaginationParams, PaginatedResult } from './base.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Input for creating an audit log entry
 */
export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, any>;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  userId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  startDate?: Date;
  endDate?: Date;
  traceId?: string;
}

/**
 * Repository for AuditLog entity operations.
 * Provides methods for logging and querying audit events.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AuditService {
 *   constructor(private readonly auditLogRepository: AuditLogRepository) {}
 *
 *   async logAction(input: CreateAuditLogInput) {
 *     return this.auditLogRepository.log(input);
 *   }
 * }
 * ```
 */
@Injectable()
export class AuditLogRepository extends BaseRepository<
  AuditLog,
  Prisma.AuditLogCreateInput,
  Prisma.AuditLogUpdateInput,
  Prisma.AuditLogWhereInput,
  Prisma.AuditLogWhereUniqueInput,
  Prisma.AuditLogOrderByWithRelationInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'auditLog');
  }

  /**
   * Creates an audit log entry
   * @param input - The audit log data
   * @returns The created audit log
   */
  async log(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.create({
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId,
      oldValue: input.oldValue,
      newValue: input.newValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      traceId: input.traceId,
      spanId: input.spanId,
      metadata: input.metadata ?? {},
    });
  }

  /**
   * Finds audit logs with filters and pagination
   * @param filters - Filter criteria
   * @param pagination - Pagination parameters
   * @returns Paginated audit logs
   */
  async findWithFilters(
    filters: AuditLogFilters,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<AuditLog>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.resource && { resource: filters.resource }),
      ...(filters.resourceId && { resourceId: filters.resourceId }),
      ...(filters.traceId && { traceId: filters.traceId }),
      ...((filters.startDate || filters.endDate) && {
        createdAt: {
          ...(filters.startDate && { gte: filters.startDate }),
          ...(filters.endDate && { lte: filters.endDate }),
        },
      }),
    };

    return this.findManyPaginated(
      {
        ...pagination,
        sortBy: pagination.sortBy || 'createdAt',
        sortOrder: pagination.sortOrder || 'desc',
      },
      where,
    );
  }

  /**
   * Finds audit logs for a specific resource
   * @param resource - The resource type
   * @param resourceId - The resource ID
   * @returns Array of audit logs
   */
  async findByResource(resource: string, resourceId: string): Promise<AuditLog[]> {
    return this.findMany(
      { resource, resourceId },
      { createdAt: 'desc' },
    );
  }

  /**
   * Finds audit logs for a specific user
   * @param userId - The user ID
   * @param limit - Maximum results
   * @returns Array of audit logs
   */
  async findByUser(userId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Finds audit logs by trace ID (for distributed tracing)
   * @param traceId - The OpenTelemetry trace ID
   * @returns Array of audit logs
   */
  async findByTraceId(traceId: string): Promise<AuditLog[]> {
    return this.findMany({ traceId }, { createdAt: 'asc' });
  }

  /**
   * Gets distinct actions for a resource type
   * @param resource - The resource type
   * @returns Array of unique action names
   */
  async getActionsForResource(resource: string): Promise<string[]> {
    const results = await this.prisma.auditLog.findMany({
      where: { resource },
      select: { action: true },
      distinct: ['action'],
    });
    return results.map((r) => r.action);
  }

  /**
   * Gets audit log statistics
   * @param startDate - Start of period
   * @param endDate - End of period
   * @returns Statistics object
   */
  async getStatistics(
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalLogs: number;
    uniqueUsers: number;
    actionCounts: Record<string, number>;
    resourceCounts: Record<string, number>;
  }> {
    const whereClause: Prisma.AuditLogWhereInput = {
      createdAt: { gte: startDate, lte: endDate },
    };

    const [totalLogs, uniqueUsersResult, actionGroups, resourceGroups] = await Promise.all([
      this.count(whereClause),
      this.prisma.auditLog.findMany({
        where: { ...whereClause, userId: { not: null } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: whereClause,
        _count: { action: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ['resource'],
        where: whereClause,
        _count: { resource: true },
      }),
    ]);

    const actionCounts: Record<string, number> = {};
    for (const group of actionGroups) {
      actionCounts[group.action] = group._count.action;
    }

    const resourceCounts: Record<string, number> = {};
    for (const group of resourceGroups) {
      resourceCounts[group.resource] = group._count.resource;
    }

    return {
      totalLogs,
      uniqueUsers: uniqueUsersResult.length,
      actionCounts,
      resourceCounts,
    };
  }

  /**
   * Deletes old audit logs (for data retention)
   * @param olderThan - Delete logs older than this date
   * @returns Count of deleted logs
   */
  async deleteOldLogs(olderThan: Date): Promise<{ count: number }> {
    this.logger.warn(`Deleting audit logs older than ${olderThan.toISOString()}`);
    return this.deleteMany({ createdAt: { lt: olderThan } });
  }
}
