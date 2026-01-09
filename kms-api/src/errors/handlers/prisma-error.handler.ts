import { Prisma } from '@prisma/client';
import { AppError } from '../types/app-error';
import { ErrorFactory } from '../types/error-factory';
import { ERROR_CODES } from '../error-codes';

/**
 * Prisma error code mappings
 * https://www.prisma.io/docs/reference/api-reference/error-reference
 */
const PRISMA_ERROR_MAP: Record<string, (error: any) => AppError> = {
  // Unique constraint violation
  P2002: (error) => {
    const target = error.meta?.target as string[] | undefined;
    const field = target?.[0] || 'field';
    return ErrorFactory.uniqueViolation(field);
  },

  // Foreign key constraint failure
  P2003: (error) => {
    const field = error.meta?.field_name as string | undefined;
    return new AppError({
      code: ERROR_CODES.DAT.FOREIGN_KEY_VIOLATION,
      message: field
        ? `Related ${field} does not exist`
        : 'Related record does not exist',
      statusCode: 400,
    });
  },

  // Record not found
  P2001: () => ErrorFactory.notFound(),
  P2018: () => ErrorFactory.notFound(),
  P2025: (error) => {
    const modelName = error.meta?.modelName || error.meta?.cause;
    return ErrorFactory.notFound(modelName);
  },

  // Required field missing
  P2011: (error) => {
    const constraint = error.meta?.constraint as string | undefined;
    return new AppError({
      code: ERROR_CODES.VAL.REQUIRED_FIELD,
      message: constraint
        ? `Required field '${constraint}' is missing`
        : 'Required field is missing',
      statusCode: 400,
    });
  },

  // Constraint violation
  P2004: () =>
    new AppError({
      code: ERROR_CODES.DAT.CONSTRAINT_VIOLATION,
      statusCode: 400,
    }),

  // Value too long
  P2000: (error) => {
    const column = error.meta?.column as string | undefined;
    return new AppError({
      code: ERROR_CODES.VAL.FIELD_TOO_LONG,
      message: column
        ? `Value for '${column}' is too long`
        : 'Value is too long for the column',
      statusCode: 400,
    });
  },

  // Invalid value
  P2005: (error) => {
    const column = error.meta?.column as string | undefined;
    return new AppError({
      code: ERROR_CODES.VAL.INVALID_TYPE,
      message: column ? `Invalid value for '${column}'` : 'Invalid value provided',
      statusCode: 400,
    });
  },

  // Connection errors
  P1001: () =>
    new AppError({
      code: ERROR_CODES.DAT.CONNECTION_FAILED,
      message: 'Cannot reach database server',
      statusCode: 503,
    }),

  P1002: () =>
    new AppError({
      code: ERROR_CODES.DAT.CONNECTION_FAILED,
      message: 'Database server connection timed out',
      statusCode: 503,
    }),

  P1003: () =>
    new AppError({
      code: ERROR_CODES.DAT.CONNECTION_FAILED,
      message: 'Database does not exist',
      statusCode: 503,
    }),

  P1008: () =>
    new AppError({
      code: ERROR_CODES.GEN.TIMEOUT,
      message: 'Database operation timed out',
      statusCode: 504,
    }),

  P1017: () =>
    new AppError({
      code: ERROR_CODES.DAT.CONNECTION_FAILED,
      message: 'Server closed the connection',
      statusCode: 503,
    }),

  // Transaction errors
  P2034: () =>
    new AppError({
      code: ERROR_CODES.DAT.TRANSACTION_FAILED,
      message: 'Transaction failed due to write conflict or deadlock',
      statusCode: 409,
    }),
};

/**
 * Handles Prisma errors and converts them to AppError
 *
 * @param error - The Prisma error to handle
 * @returns AppError instance
 *
 * @example
 * ```typescript
 * try {
 *   await prisma.user.create({ data });
 * } catch (error) {
 *   if (error instanceof Prisma.PrismaClientKnownRequestError) {
 *     throw handlePrismaError(error);
 *   }
 *   throw error;
 * }
 * ```
 */
export function handlePrismaError(error: unknown): AppError {
  // Handle known Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const handler = PRISMA_ERROR_MAP[error.code];
    if (handler) {
      return handler(error);
    }

    // Unknown Prisma error code
    return new AppError({
      code: ERROR_CODES.DAT.QUERY_FAILED,
      message: `Database error: ${error.message}`,
      cause: error,
      isOperational: false,
      context: {
        metadata: {
          prismaCode: error.code,
          meta: error.meta,
        },
      },
    });
  }

  // Handle validation errors
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError({
      code: ERROR_CODES.VAL.INVALID_INPUT,
      message: 'Invalid data provided to database operation',
      cause: error,
      statusCode: 400,
    });
  }

  // Handle initialization errors
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new AppError({
      code: ERROR_CODES.DAT.CONNECTION_FAILED,
      message: 'Failed to initialize database connection',
      cause: error,
      statusCode: 503,
      isOperational: false,
    });
  }

  // Handle Rust panic errors
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return new AppError({
      code: ERROR_CODES.SRV.INTERNAL_ERROR,
      message: 'Database engine error',
      cause: error,
      statusCode: 500,
      isOperational: false,
    });
  }

  // Handle unknown request errors
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return new AppError({
      code: ERROR_CODES.DAT.QUERY_FAILED,
      message: 'Unknown database error',
      cause: error,
      statusCode: 500,
      isOperational: false,
    });
  }

  // If not a Prisma error, wrap as internal error
  return AppError.wrap(error, ERROR_CODES.DAT.QUERY_FAILED);
}

/**
 * Checks if an error is a Prisma error
 */
export function isPrismaError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError
  );
}

/**
 * Creates a safe wrapper for repository methods
 * Catches Prisma errors and converts them to AppError
 *
 * @example
 * ```typescript
 * class UserRepository {
 *   async findById(id: string) {
 *     return withPrismaErrorHandling(async () => {
 *       return this.prisma.user.findUniqueOrThrow({ where: { id } });
 *     });
 *   }
 * }
 * ```
 */
export async function withPrismaErrorHandling<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPrismaError(error)) {
      throw handlePrismaError(error);
    }
    throw error;
  }
}
