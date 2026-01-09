/**
 * Database Module Exports
 *
 * Central export point for all database-related functionality.
 *
 * @example
 * ```typescript
 * import {
 *   DatabaseModule,
 *   PrismaService,
 *   UserRepository,
 *   ApiKeyRepository,
 * } from '@database';
 * ```
 */

export * from './database.module';
export * from './prisma/prisma.module';
export * from './prisma/prisma.service';
export * from './repositories';
