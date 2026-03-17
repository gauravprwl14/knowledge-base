/**
 * Error definitions following the ERROR_GUIDE.md pattern for frontend
 */

export enum ErrorType {
  CRITICAL = 'CRITICAL',
  FATAL = 'FATAL',
  SYSTEM = 'SYSTEM',
  OPERATIONAL = 'OPERATIONAL',
  VALIDATION = 'VALIDATION',
  BUSINESS_LOGIC = 'BUSINESS_LOGIC',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  CONCURRENCY = 'CONCURRENCY',
  FRAUD = 'FRAUD',
  DATABASE = 'DATABASE',
  DEPENDENCY = 'DEPENDENCY',
  TIMEOUT = 'TIMEOUT',
  USER_INPUT = 'USER_INPUT',
  SECURITY = 'SECURITY',
  CONFIGURATION = 'CONFIGURATION',
  DATA_INTEGRITY = 'DATA_INTEGRITY',
  RATE_LIMITING = 'RATE_LIMITING',
  RETRYABLE = 'RETRYABLE',
  NOT_FOUND = 'NOT_FOUND',
  NETWORK = 'NETWORK',
}

export enum ErrorCategory {
  CLIENT = 'CLIENT',
  SERVER = 'SERVER',
  NETWORK = 'NETWORK',
  SECURITY = 'SECURITY',
  TRANSACTION = 'TRANSACTION',
  COMPLIANCE = 'COMPLIANCE',
  THIRD_PARTY = 'THIRD_PARTY',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
  DATABASE = 'DATABASE',
  API = 'API',
  QUEUE = 'QUEUE',
  DATA_VALIDATION = 'DATA_VALIDATION',
  RESOURCE_LIMIT = 'RESOURCE_LIMIT',
  SESSION = 'SESSION',
}

export interface ApiError {
  errorCode: string;
  statusCode: number;
  errorType: ErrorType;
  errorCategory: ErrorCategory;
  message: string;
  messageKey: string;
  data?: Record<string, any>;
}

export interface ApiErrorResponse {
  statusCode: number;
  errors: ApiError[];
}

export class AppError extends Error {
  public readonly errorCode: string;
  public readonly statusCode: number;
  public readonly errorType: ErrorType;
  public readonly errorCategory: ErrorCategory;
  public readonly messageKey: string;
  public readonly data?: Record<string, any>;

  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = 'AppError';
    this.errorCode = apiError.errorCode;
    this.statusCode = apiError.statusCode;
    this.errorType = apiError.errorType;
    this.errorCategory = apiError.errorCategory;
    this.messageKey = apiError.messageKey;
    this.data = apiError.data;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Check if this is a specific error code
   */
  is(errorCode: string): boolean {
    return this.errorCode === errorCode;
  }

  /**
   * Check if this is a client error (4xx)
   */
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Check if this is a server error (5xx)
   */
  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /**
   * Get user-friendly message
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      errorCode: this.errorCode,
      statusCode: this.statusCode,
      errorType: this.errorType,
      errorCategory: this.errorCategory,
      message: this.message,
      messageKey: this.messageKey,
      data: this.data,
    };
  }
}

/**
 * Network error (no response from server)
 */
export class NetworkError extends Error {
  constructor(message: string = 'Network error occurred') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Parse error response from API
 */
export function parseErrorResponse(error: any): AppError | NetworkError | Error {
  // Axios error with response
  if (error.response) {
    const response = error.response;
    
    // API error response with structured errors
    if (response.data?.errors && Array.isArray(response.data.errors)) {
      const apiError = response.data.errors[0]; // Take first error
      return new AppError(apiError);
    }
    
    // API error response with single error
    if (response.data?.errorCode) {
      return new AppError(response.data);
    }
    
    // Generic HTTP error
    return new Error(
      response.data?.message || 
      response.data?.detail || 
      `HTTP ${response.status}: ${response.statusText}`
    );
  }

  // Axios error without response (network error)
  if (error.request) {
    return new NetworkError(error.message || 'Network connection failed');
  }

  // Axios timeout error
  if (error.code === 'ECONNABORTED') {
    return new NetworkError('Request timeout');
  }

  // Already parsed error
  if (error instanceof AppError || error instanceof NetworkError) {
    return error;
  }

  // Fallback to generic error
  if (error instanceof Error) {
    return error;
  }

  return new Error(error?.message || 'Unknown error occurred');
}

/**
 * Error codes for quick reference
 */
export const ErrorCodes = {
  // Job errors
  JOB_NOT_FOUND: 'JOB1001',
  JOB_UNAUTHORIZED: 'JOB1002',
  JOB_INVALID_STATE_CANCEL: 'JOB1003',
  JOB_INVALID_STATE_DELETE: 'JOB1004',
  JOB_FILE_DELETION_FAILED: 'JOB1005',
  JOB_FILE_NOT_FOUND: 'JOB1006',
  JOB_NO_JOBS_PROVIDED: 'JOB1007',
  JOB_BULK_LIMIT_EXCEEDED: 'JOB1008',
  JOB_BULK_PARTIAL_FAILURE: 'JOB1009',
  JOB_DATABASE_ERROR: 'JOB1010',
  JOB_TRANSCRIPTION_NOT_FOUND: 'JOB1011',
} as const;
