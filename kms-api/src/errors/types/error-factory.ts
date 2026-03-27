import { AppError, ValidationErrorDetail, ErrorContext } from './app-error';
import {
  ERROR_CODES,
  ErrorCode,
  ErrorDefinition,
  AnyErrorDefinition,
  getErrorDefinition,
} from '../error-codes';

/**
 * ErrorFactory - Factory class for creating typed application errors
 *
 * Provides convenient methods for creating errors by category with proper
 * error codes and HTTP status codes.
 *
 * @example
 * ```typescript
 * // Validation error
 * throw ErrorFactory.validation(
 *   ERROR_CODES.VAL.INVALID_EMAIL,
 *   'Please provide a valid email address',
 * );
 *
 * // Not found error
 * throw ErrorFactory.notFound('user', userId);
 *
 * // Unauthorized error
 * throw ErrorFactory.unauthorized('Invalid credentials');
 *
 * // With context
 * throw ErrorFactory.internal('Database connection failed')
 *   .withContext({ requestId: req.id, traceId: span.traceId });
 * ```
 */
export class ErrorFactory {
  /**
   * Creates a validation error
   * @param code - Validation error code
   * @param message - Custom message
   * @param details - Field-level validation details
   */
  static validation(
    code: ErrorCode = ERROR_CODES.VAL.INVALID_INPUT.code,
    message?: string,
    details?: ValidationErrorDetail[],
  ): AppError {
    const definition = getErrorDefinition(code);
    return new AppError({
      code,
      message: message || definition?.message,
      details,
      statusCode: definition?.httpStatus || 400,
    });
  }

  /**
   * Creates a validation error from Zod issues
   * @param issues - Zod validation issues
   */
  static fromZodErrors(issues: Array<{ path: (string | number)[]; message: string }>): AppError {
    const details: ValidationErrorDetail[] = issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    const definition = getErrorDefinition(ERROR_CODES.VAL.INVALID_INPUT.code);
    return new AppError({
      code: ERROR_CODES.VAL.INVALID_INPUT.code,
      message: 'Validation failed',
      details,
      statusCode: definition?.httpStatus || 400,
    });
  }

  /**
   * Creates a validation error from class-validator errors
   * @param errors - Class-validator validation errors
   */
  static fromClassValidatorErrors(
    errors: Array<{
      property: string;
      constraints?: Record<string, string>;
      value?: any;
    }>,
  ): AppError {
    const details: ValidationErrorDetail[] = errors.map((error) => ({
      field: error.property,
      message: error.constraints
        ? Object.values(error.constraints).join(', ')
        : 'Invalid value',
      value: error.value,
    }));

    const definition = getErrorDefinition(ERROR_CODES.VAL.INVALID_INPUT.code);
    return new AppError({
      code: ERROR_CODES.VAL.INVALID_INPUT.code,
      message: 'Validation failed',
      details,
      statusCode: definition?.httpStatus || 400,
    });
  }

  /**
   * Creates an authentication error
   * @param code - Authentication error code
   * @param message - Custom message
   */
  static authentication(
    code: ErrorCode = ERROR_CODES.AUT.UNAUTHENTICATED.code,
    message?: string,
  ): AppError {
    const definition = getErrorDefinition(code);
    return new AppError({
      code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 401,
    });
  }

  /**
   * Creates an unauthorized error (invalid credentials)
   * @param message - Custom message
   */
  static unauthorized(message?: string): AppError {
    return ErrorFactory.authentication(ERROR_CODES.AUT.INVALID_CREDENTIALS.code, message);
  }

  /**
   * Creates an authorization error
   * @param code - Authorization error code
   * @param message - Custom message
   */
  static authorization(
    code: ErrorCode = ERROR_CODES.AUZ.FORBIDDEN.code,
    message?: string,
  ): AppError {
    const definition = getErrorDefinition(code);
    return new AppError({
      code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 403,
    });
  }

  /**
   * Creates a forbidden error
   * @param message - Custom message
   */
  static forbidden(message?: string): AppError {
    return ErrorFactory.authorization(ERROR_CODES.AUZ.FORBIDDEN.code, message);
  }

  /**
   * Creates an insufficient permissions error
   * @param requiredPermission - The permission that was required
   */
  static insufficientPermissions(requiredPermission?: string): AppError {
    const message = requiredPermission
      ? `Missing required permission: ${requiredPermission}`
      : undefined;

    return ErrorFactory.authorization(ERROR_CODES.AUZ.INSUFFICIENT_PERMISSIONS.code, message);
  }

  /**
   * Creates a not found error
   * @param resource - The resource type that was not found
   * @param identifier - The identifier that was searched for
   */
  static notFound(resource?: string, identifier?: string): AppError {
    let message: string | undefined;

    if (resource && identifier) {
      message = `${resource} with id '${identifier}' not found`;
    } else if (resource) {
      message = `${resource} not found`;
    }

    const definition = getErrorDefinition(ERROR_CODES.DAT.NOT_FOUND.code);
    return new AppError({
      code: ERROR_CODES.DAT.NOT_FOUND.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 404,
      context: resource
        ? { resource, resourceId: identifier }
        : undefined,
    });
  }

  /**
   * Creates a conflict error (resource already exists)
   * @param resource - The resource type
   * @param identifier - The conflicting identifier
   */
  static conflict(resource?: string, identifier?: string): AppError {
    let message: string | undefined;

    if (resource && identifier) {
      message = `${resource} with id '${identifier}' already exists`;
    } else if (resource) {
      message = `${resource} already exists`;
    }

    const definition = getErrorDefinition(ERROR_CODES.DAT.CONFLICT.code);
    return new AppError({
      code: ERROR_CODES.DAT.CONFLICT.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 409,
      context: resource
        ? { resource, resourceId: identifier }
        : undefined,
    });
  }

  /**
   * Creates a unique constraint violation error
   * @param field - The field that violates uniqueness
   * @param value - The duplicate value
   */
  static uniqueViolation(field: string, value?: string): AppError {
    const message = value
      ? `${field} '${value}' already exists`
      : `${field} already exists`;

    const definition = getErrorDefinition(ERROR_CODES.DAT.UNIQUE_VIOLATION.code);
    return new AppError({
      code: ERROR_CODES.DAT.UNIQUE_VIOLATION.code,
      message,
      statusCode: definition?.httpStatus || 409,
      details: [{ field, message }],
    });
  }

  /**
   * Creates a rate limit error
   * @param retryAfter - Seconds until retry is allowed
   */
  static rateLimited(retryAfter?: number): AppError {
    const message = retryAfter
      ? `Too many requests. Please retry after ${retryAfter} seconds`
      : undefined;

    const definition = getErrorDefinition(ERROR_CODES.GEN.RATE_LIMITED.code);
    return new AppError({
      code: ERROR_CODES.GEN.RATE_LIMITED.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 429,
      context: retryAfter ? { metadata: { retryAfter } } : undefined,
    });
  }

  /**
   * Creates an internal server error
   * @param message - Error message (not exposed in production)
   * @param cause - Original error
   */
  static internal(message?: string, cause?: Error): AppError {
    const definition = getErrorDefinition(ERROR_CODES.SRV.INTERNAL_ERROR.code);
    return new AppError({
      code: ERROR_CODES.SRV.INTERNAL_ERROR.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 500,
      cause,
      isOperational: false,
    });
  }

  /**
   * Creates a service unavailable error
   * @param serviceName - Name of the unavailable service
   */
  static serviceUnavailable(serviceName?: string): AppError {
    const message = serviceName
      ? `Service '${serviceName}' is temporarily unavailable`
      : undefined;

    const definition = getErrorDefinition(ERROR_CODES.GEN.SERVICE_UNAVAILABLE.code);
    return new AppError({
      code: ERROR_CODES.GEN.SERVICE_UNAVAILABLE.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 503,
    });
  }

  /**
   * Creates an external service error
   * @param serviceName - Name of the external service
   * @param cause - Original error
   */
  static externalService(serviceName: string, cause?: Error): AppError {
    const definition = getErrorDefinition(ERROR_CODES.EXT.SERVICE_ERROR.code);
    return new AppError({
      code: ERROR_CODES.EXT.SERVICE_ERROR.code,
      message: `External service '${serviceName}' returned an error`,
      statusCode: definition?.httpStatus || 502,
      cause,
      context: { metadata: { service: serviceName } },
    });
  }

  /**
   * Creates an external service timeout error
   * @param serviceName - Name of the external service
   * @param timeoutMs - Timeout duration in milliseconds
   */
  static externalServiceTimeout(serviceName: string, timeoutMs?: number): AppError {
    const message = timeoutMs
      ? `External service '${serviceName}' timed out after ${timeoutMs}ms`
      : `External service '${serviceName}' timed out`;

    const definition = getErrorDefinition(ERROR_CODES.EXT.SERVICE_TIMEOUT.code);
    return new AppError({
      code: ERROR_CODES.EXT.SERVICE_TIMEOUT.code,
      message,
      statusCode: definition?.httpStatus || 504,
      context: { metadata: { service: serviceName, timeoutMs } },
    });
  }

  /**
   * Creates a timeout error
   * @param operation - The operation that timed out
   */
  static timeout(operation?: string): AppError {
    const message = operation ? `Operation '${operation}' timed out` : undefined;

    const definition = getErrorDefinition(ERROR_CODES.GEN.TIMEOUT.code);
    return new AppError({
      code: ERROR_CODES.GEN.TIMEOUT.code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 504,
    });
  }

  /**
   * Creates a database error
   * @param code - Database error code
   * @param message - Error message
   * @param cause - Original error
   */
  static database(
    code: ErrorCode = ERROR_CODES.DAT.QUERY_FAILED.code,
    message?: string,
    cause?: Error,
  ): AppError {
    const definition = getErrorDefinition(code);
    return new AppError({
      code,
      message: message || definition?.message,
      statusCode: definition?.httpStatus || 500,
      cause,
      isOperational: false,
    });
  }

  /**
   * Creates a queue error
   * @param message - Error message
   * @param cause - Original error
   */
  static queue(message?: string, cause?: Error): AppError {
    const definition = getErrorDefinition(ERROR_CODES.SRV.QUEUE_ERROR.code);
    return new AppError({
      code: ERROR_CODES.SRV.QUEUE_ERROR.code,
      message: message || definition?.message,
      cause,
      statusCode: definition?.httpStatus || 500,
      isOperational: false,
    });
  }

  /**
   * Creates a cache error
   * @param message - Error message
   * @param cause - Original error
   */
  static cache(message?: string, cause?: Error): AppError {
    const definition = getErrorDefinition(ERROR_CODES.SRV.CACHE_ERROR.code);
    return new AppError({
      code: ERROR_CODES.SRV.CACHE_ERROR.code,
      message: message || definition?.message,
      cause,
      statusCode: definition?.httpStatus || 500,
      isOperational: false,
    });
  }

  /**
   * Creates a generic error from an error code
   * @param code - Error code
   * @param overrides - Optional overrides
   */
  static fromCode(
    code: ErrorCode,
    overrides?: {
      message?: string;
      details?: ValidationErrorDetail[];
      cause?: Error;
      context?: ErrorContext;
    },
  ): AppError {
    const definition = getErrorDefinition(code);
    return new AppError({
      code,
      message: overrides?.message || definition?.message,
      statusCode: definition?.httpStatus || 500,
      ...overrides,
    });
  }
}
