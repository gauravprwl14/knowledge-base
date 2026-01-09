/**
 * Common Module Exports
 *
 * Central export point for all common functionality:
 * - Filters (exception handling)
 * - Guards (authorization)
 * - Interceptors (request/response transformation)
 * - Pipes (validation)
 * - Decorators (custom metadata)
 * - Middleware (request processing)
 * - DTOs (data transfer objects)
 *
 * @example
 * ```typescript
 * import {
 *   AllExceptionsFilter,
 *   RolesGuard,
 *   TransformInterceptor,
 *   ZodValidationPipe,
 *   Roles,
 *   CurrentUser,
 *   RequestIdMiddleware,
 *   PaginationQuery,
 * } from '@common';
 * ```
 */

export * from './filters';
export * from './guards';
export * from './interceptors';
export * from './pipes';
export * from './decorators';
export * from './middleware';
export * from './dto';
