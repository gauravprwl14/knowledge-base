import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, getErrorDefinition } from '../error-codes';

/**
 * Error details interface for validation errors
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: any;
  constraint?: string;
}

/**
 * Error context for additional debugging information
 */
export interface ErrorContext {
  /** Unique request identifier */
  requestId?: string;
  /** OpenTelemetry trace ID */
  traceId?: string;
  /** OpenTelemetry span ID */
  spanId?: string;
  /** User ID if authenticated */
  userId?: string;
  /** Resource that caused the error */
  resource?: string;
  /** Resource ID */
  resourceId?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Options for creating an AppError
 */
export interface AppErrorOptions {
  /** Error code from error codes */
  code: ErrorCode;
  /** Human-readable error message */
  message?: string;
  /** HTTP status code (auto-derived from error code if not provided) */
  statusCode?: number;
  /** Validation error details */
  details?: ValidationErrorDetail[];
  /** Original error that caused this error */
  cause?: Error;
  /** Additional context */
  context?: ErrorContext;
  /** Whether to expose details in production */
  isOperational?: boolean;
}

/**
 * AppError - Custom application error class
 *
 * Extends HttpException to provide structured error responses with:
 * - Error codes for client handling
 * - Validation details
 * - Tracing context
 * - Operational vs programming error distinction
 *
 * @example
 * ```typescript
 * // Simple usage
 * throw new AppError({ code: ERROR_CODES.DAT.NOT_FOUND });
 *
 * // With custom message
 * throw new AppError({
 *   code: ERROR_CODES.VAL.INVALID_EMAIL,
 *   message: 'The provided email is not valid',
 * });
 *
 * // With validation details
 * throw new AppError({
 *   code: ERROR_CODES.VAL.INVALID_INPUT,
 *   details: [
 *     { field: 'email', message: 'Invalid email format' },
 *     { field: 'password', message: 'Password too short' },
 *   ],
 * });
 * ```
 */
export class AppError extends HttpException {
  /** Error code for programmatic handling */
  public readonly code: ErrorCode;

  /** Validation error details */
  public readonly details?: ValidationErrorDetail[];

  /** Original error that caused this error */
  public readonly cause: Error | undefined;

  /** Additional context */
  public readonly context?: ErrorContext;

  /**
   * Whether this is an operational error (expected) vs programming error (bug)
   * Operational errors are safe to expose to clients
   * Programming errors should not expose details in production
   */
  public readonly isOperational: boolean;

  /** Timestamp when error was created */
  public readonly timestamp: string;

  constructor(options: AppErrorOptions) {
    const {
      code,
      message,
      statusCode,
      details,
      cause,
      context,
      isOperational = true,
    } = options;

    // Get error definition for defaults
    const definition = getErrorDefinition(code);
    const finalMessage = message || definition?.message || 'An error occurred';
    const finalStatusCode = statusCode || definition?.httpStatus || 500;

    // Build the response body
    const responseBody = {
      success: false,
      error: {
        code,
        message: finalMessage,
        ...(details && details.length > 0 && { details }),
        ...(context?.requestId && { requestId: context.requestId }),
        ...(context?.traceId && { traceId: context.traceId }),
      },
      timestamp: new Date().toISOString(),
    };

    super(responseBody, finalStatusCode, { cause });

    this.code = code;
    this.details = details;
    this.cause = cause;
    this.context = context;
    this.isOperational = isOperational;
    this.timestamp = responseBody.timestamp;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);

    // Set the prototype explicitly for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Gets the HTTP status code
   */
  get statusCode(): number {
    return this.getStatus();
  }

  /**
   * Gets the error message
   */
  get errorMessage(): string {
    const response = this.getResponse() as { error: { message: string } };
    return response.error.message;
  }

  /**
   * Converts error to a log-friendly object
   */
  toLog(): Record<string, any> {
    return {
      code: this.code,
      message: this.errorMessage,
      statusCode: this.statusCode,
      details: this.details,
      context: this.context,
      isOperational: this.isOperational,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
            stack: this.cause.stack,
          }
        : undefined,
    };
  }

  /**
   * Converts error to API response format
   * @param includeStack - Whether to include stack trace (development only)
   */
  toResponse(includeStack: boolean = false): Record<string, any> {
    const response = this.getResponse() as Record<string, any>;

    if (includeStack && this.stack) {
      response.error.stack = this.stack.split('\n').slice(0, 10);
    }

    return response;
  }

  /**
   * Creates a new AppError with additional context
   * @param context - Additional context to merge
   */
  withContext(context: Partial<ErrorContext>): AppError {
    return new AppError({
      code: this.code,
      message: this.errorMessage,
      statusCode: this.statusCode,
      details: this.details,
      cause: this.cause,
      context: { ...this.context, ...context },
      isOperational: this.isOperational,
    });
  }

  /**
   * Checks if an error is an AppError instance
   */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  /**
   * Wraps any error as an AppError
   * @param error - The error to wrap
   * @param defaultCode - Default error code if not an AppError
   */
  static wrap(error: unknown, defaultCode: ErrorCode = 'GEN0001'): AppError {
    if (AppError.isAppError(error)) {
      return error;
    }

    if (error instanceof HttpException) {
      const response = error.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : (response as any).message || error.message;

      return new AppError({
        code: defaultCode,
        message,
        statusCode: error.getStatus(),
        cause: error,
        isOperational: true,
      });
    }

    if (error instanceof Error) {
      return new AppError({
        code: defaultCode,
        message: error.message,
        cause: error,
        isOperational: false,
      });
    }

    return new AppError({
      code: defaultCode,
      message: String(error),
      isOperational: false,
    });
  }
}
