import { ErrorType } from './types';
import { ErrorCategory } from './types';

/**
 * Error Definition Interface
 */
export interface ErrorDefinition {
  code: string;
  message: string;
  messageKey: string;
  errorType: ErrorType;
  errorCategory: ErrorCategory;
  statusCode: number;
  metadata?: Record<string, unknown>;
}

/**
 * Base Application Error
 * All custom errors should extend this class
 */
export class BaseError extends Error {
  public readonly code: string;
  public readonly messageKey: string;
  public readonly errorType: ErrorType;
  public readonly errorCategory: ErrorCategory;
  public readonly statusCode: number;
  public readonly metadata?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(definition: ErrorDefinition) {
    super(definition.message);
    this.name = 'BaseError';
    this.code = definition.code;
    this.messageKey = definition.messageKey;
    this.errorType = definition.errorType;
    this.errorCategory = definition.errorCategory;
    this.statusCode = definition.statusCode;
    this.metadata = definition.metadata;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      messageKey: this.messageKey,
      errorType: this.errorType,
      errorCategory: this.errorCategory,
      statusCode: this.statusCode,
      metadata: this.metadata,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Get user-friendly message (for display in UI)
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Get developer message (for logging)
   */
  getDeveloperMessage(): string {
    return `[${this.code}] ${this.message}`;
  }
}
