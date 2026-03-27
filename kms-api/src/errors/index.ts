/**
 * Error Module Exports
 *
 * Central export point for all error handling functionality.
 *
 * @example
 * ```typescript
 * import {
 *   AppError,
 *   ErrorFactory,
 *   ERROR_CODES,
 *   handlePrismaError,
 * } from '@errors';
 *
 * // Create errors easily
 * throw ErrorFactory.notFound('User', userId);
 * throw ErrorFactory.validation(ERROR_CODES.VAL.INVALID_EMAIL);
 *
 * // Check error types
 * if (AppError.isAppError(error)) {
 *   console.log(error.code);
 * }
 * ```
 */

export * from './error-codes';
export * from './types';
export * from './handlers';
