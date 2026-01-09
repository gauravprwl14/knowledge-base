import { AppError, ValidationErrorDetail, ErrorContext } from './app-error';
import { ERROR_CODES, ErrorCode, getErrorMessage } from '../error-codes';

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
    code: ErrorCode = ERROR_CODES.VAL.INVALID_INPUT,
    message?: string,
    details?: ValidationErrorDetail[],
  ): AppError {
    return new AppError({
      code,
      message,
      details,
      statusCode: 400,
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

    return new AppError({
      code: ERROR_CODES.VAL.INVALID_INPUT,
      message: 'Validation failed',
      details,
      statusCode: 400,
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

    return new AppError({
      code: ERROR_CODES.VAL.INVALID_INPUT,
      message: 'Validation failed',
      details,
      statusCode: 400,
    });
  }

  /**
   * Creates an authentication error
   * @param code - Authentication error code
   * @param message - Custom message
   */
  static authentication(
    code: ErrorCode = ERROR_CODES.AUT.UNAUTHENTICATED,
    message?: string,
  ): AppError {
    return new AppError({
      code,
      message,
      statusCode: 401,
    });
  }

  /**
   * Creates an unauthorized error (invalid credentials)
   * @param message - Custom message
   */
  static unauthorized(message?: string): AppError {
    return ErrorFactory.authentication(ERROR_CODES.AUT.INVALID_CREDENTIALS, message);
  }

  /**
   * Creates an authorization error
   * @param code - Authorization error code
   * @param message - Custom message
   */
  static authorization(
    code: ErrorCode = ERROR_CODES.AUZ.FORBIDDEN,
    message?: string,
  ): AppError {
    return new AppError({
      code,
      message,
      statusCode: 403,
    });
  }

  /**
   * Creates a forbidden error
   * @param message - Custom message
   */
  static forbidden(message?: string): AppError {
    return ErrorFactory.authorization(ERROR_CODES.AUZ.FORBIDDEN, message);
  }

  /**
   * Creates an insufficient permissions error
   * @param requiredPermission - The permission that was required
   */
  static insufficientPermissions(requiredPermission?: string): AppError {
    const message = requiredPermission
      ? `Missing required permission: ${requiredPermission}`
      : undefined;

    return ErrorFactory.authorization(ERROR_CODES.AUZ.INSUFFICIENT_PERMISSIONS, message);
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

    return new AppError({
      code: ERROR_CODES.DAT.NOT_FOUND,
      message,
      statusCode: 404,
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

    return new AppError({
      code: ERROR_CODES.DAT.CONFLICT,
      message,
      statusCode: 409,
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

    return new AppError({
      code: ERROR_CODES.DAT.UNIQUE_VIOLATION,
      message,
      statusCode: 409,
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

    return new AppError({
      code: ERROR_CODES.GEN.RATE_LIMITED,
      message,
      statusCode: 429,
      context: retryAfter ? { metadata: { retryAfter } } : undefined,
    });
  }

  /**
   * Creates an internal server error
   * @param message - Error message (not exposed in production)
   * @param cause - Original error
   */
  static internal(message?: string, cause?: Error): AppError {
    return new AppError({
      code: ERROR_CODES.SRV.INTERNAL_ERROR,
      message,
      statusCode: 500,
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

    return new AppError({
      code: ERROR_CODES.GEN.SERVICE_UNAVAILABLE,
      message,
      statusCode: 503,
    });
  }

  /**
   * Creates an external service error
   * @param serviceName - Name of the external service
   * @param cause - Original error
   */
  static externalService(serviceName: string, cause?: Error): AppError {
    return new AppError({
      code: ERROR_CODES.EXT.SERVICE_ERROR,
      message: `External service '${serviceName}' returned an error`,
      statusCode: 502,
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

    return new AppError({
      code: ERROR_CODES.EXT.SERVICE_TIMEOUT,
      message,
      statusCode: 504,
      context: { metadata: { service: serviceName, timeoutMs } },
    });
  }

  /**
   * Creates a timeout error
   * @param operation - The operation that timed out
   */
  static timeout(operation?: string): AppError {
    const message = operation ? `Operation '${operation}' timed out` : undefined;

    return new AppError({
      code: ERROR_CODES.GEN.TIMEOUT,
      message,
      statusCode: 504,
    });
  }

  /**
   * Creates a database error
   * @param code - Database error code
   * @param message - Error message
   * @param cause - Original error
   */
  static database(
    code: ErrorCode = ERROR_CODES.DAT.QUERY_FAILED,
    message?: string,
    cause?: Error,
  ): AppError {
    return new AppError({
      code,
      message,
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
    return new AppError({
      code: ERROR_CODES.SRV.QUEUE_ERROR,
      message,
      cause,
      statusCode: 500,
      isOperational: false,
    });
  }

  /**
   * Creates a cache error
   * @param message - Error message
   * @param cause - Original error
   */
  static cache(message?: string, cause?: Error): AppError {
    return new AppError({
      code: ERROR_CODES.SRV.CACHE_ERROR,
      message,
      cause,
      statusCode: 500,
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
    return new AppError({
      code,
      ...overrides,
    });
  }
}
