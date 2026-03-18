/**
 * Database Repositories
 *
 * This module exports all repository classes for data access.
 * Repositories implement the repository pattern and provide
 * a clean abstraction over Prisma operations.
 *
 * @example
 * ```typescript
 * import { UserRepository, ApiKeyRepository } from '@database/repositories';
 *
 * @Injectable()
 * export class MyService {
 *   constructor(
 *     private readonly userRepository: UserRepository,
 *     private readonly apiKeyRepository: ApiKeyRepository,
 *   ) {}
 * }
 * ```
 */

export * from './base.repository';
export * from './user.repository';
export * from './api-key.repository';
export * from './audit-log.repository';
export * from './source.repository';
export * from './scan-job.repository';
export * from './file.repository';
