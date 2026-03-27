import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Severity level for search-api errors.
 */
export type ErrorSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Minimal error definition shape used by the search-api.
 */
export interface ErrorDefinition {
  readonly code: string;
  readonly message: string;
  readonly httpStatus: number;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly userFacing: boolean;
}

/**
 * Search-specific error codes (SCH domain = KBSCH).
 * General codes are re-exported from the shared registry.
 */
export const SEARCH_ERROR_CODES = {
  // SCH = Search domain
  QUERY_REQUIRED: {
    code: 'KBSCH0001',
    message: 'Search query is required',
    httpStatus: HttpStatus.BAD_REQUEST,
    severity: 'ERROR' as ErrorSeverity,
    retryable: false,
    userFacing: true,
  },
  SEARCH_FAILED: {
    code: 'KBSCH0002',
    message: 'Search operation failed',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    severity: 'ERROR' as ErrorSeverity,
    retryable: true,
    userFacing: true,
  },
  INVALID_QUERY: {
    code: 'KBSCH0003',
    message: 'Invalid search query parameters',
    httpStatus: HttpStatus.BAD_REQUEST,
    severity: 'ERROR' as ErrorSeverity,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * General-purpose error codes used by the search-api.
 */
export const GEN_ERROR_CODES = {
  INTERNAL_ERROR: {
    code: 'GEN0001',
    message: 'An internal error occurred',
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    severity: 'ERROR' as ErrorSeverity,
    retryable: false,
    userFacing: true,
  },
  SERVICE_UNAVAILABLE: {
    code: 'GEN0003',
    message: 'Service is temporarily unavailable',
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    severity: 'WARNING' as ErrorSeverity,
    retryable: true,
    userFacing: true,
  },
  NOT_IMPLEMENTED: {
    code: 'GEN0004',
    message: 'This operation is not available in the current environment',
    httpStatus: HttpStatus.NOT_IMPLEMENTED,
    severity: 'WARNING' as ErrorSeverity,
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Combined error codes for the search-api.
 */
export const ERROR_CODES = {
  SCH: SEARCH_ERROR_CODES,
  GEN: GEN_ERROR_CODES,
} as const;

/** Union type of all error code strings. */
export type ErrorCode =
  | (typeof SEARCH_ERROR_CODES)[keyof typeof SEARCH_ERROR_CODES]['code']
  | (typeof GEN_ERROR_CODES)[keyof typeof GEN_ERROR_CODES]['code'];

/**
 * Gets the error definition for a given code, scanning all categories.
 *
 * @param code - The error code string.
 * @returns The ErrorDefinition, or undefined if not found.
 */
export function getErrorDefinition(code: ErrorCode): ErrorDefinition | undefined {
  for (const category of Object.values(ERROR_CODES)) {
    for (const def of Object.values(category)) {
      if ((def as ErrorDefinition).code === code) {
        return def as ErrorDefinition;
      }
    }
  }
  return undefined;
}

/**
 * Options for creating an AppError.
 */
export interface AppErrorOptions {
  /** Structured error code (e.g. KBSCH0001). */
  code: ErrorCode;
  /** Human-readable message — defaults to error definition's message. */
  message?: string;
  /** HTTP status code — auto-derived from error code if omitted. */
  statusCode?: number;
  /** Underlying cause. */
  cause?: Error;
  /** Whether to expose in production. Defaults to true (operational). */
  isOperational?: boolean;
}

/**
 * AppError — structured application exception for the search-api.
 *
 * Extends NestJS HttpException so the global exception filter can handle it.
 *
 * @example
 * ```typescript
 * throw new AppError({ code: ERROR_CODES.SCH.QUERY_REQUIRED.code });
 * ```
 */
export class AppError extends HttpException {
  /** Structured error code for programmatic client handling. */
  public readonly code: ErrorCode;

  /** Whether this is an expected operational error (vs a programming bug). */
  public readonly isOperational: boolean;

  /** ISO-8601 timestamp of when the error was created. */
  public readonly timestamp: string;

  constructor(options: AppErrorOptions) {
    const {
      code,
      message,
      statusCode,
      cause,
      isOperational = true,
    } = options;

    const definition = getErrorDefinition(code);
    const finalMessage = message ?? definition?.message ?? 'An error occurred';
    const finalStatus = statusCode ?? definition?.httpStatus ?? 500;

    const responseBody = {
      success: false,
      error: {
        code,
        message: finalMessage,
      },
      timestamp: new Date().toISOString(),
    };

    super(responseBody, finalStatus, { cause });

    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = responseBody.timestamp;

    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** HTTP status code. */
  get statusCode(): number {
    return this.getStatus();
  }

  /** Human-readable error message. */
  get errorMessage(): string {
    const r = this.getResponse() as { error: { message: string } };
    return r.error.message;
  }

  /** Converts error to a structured API response body. */
  toResponse(includeStack = false): Record<string, unknown> {
    const response = this.getResponse() as Record<string, unknown>;
    if (includeStack && this.stack) {
      (response as any).error.stack = this.stack.split('\n').slice(0, 10);
    }
    return response;
  }

  /** Checks whether an unknown value is an AppError instance. */
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
