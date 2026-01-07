/**
 * Error handling utilities for consistent error management
 */

import { AppError, NetworkError, parseErrorResponse } from './types';

/**
 * Handle error and return user-friendly message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.getUserMessage();
  }

  if (error instanceof NetworkError) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Log error for debugging
 */
export function logError(error: unknown, context?: string) {
  const prefix = context ? `[${context}]` : '';
  
  if (error instanceof AppError) {
    console.error(`${prefix} AppError:`, error.toJSON());
  } else if (error instanceof Error) {
    console.error(`${prefix} Error:`, error.message, error);
  } else {
    console.error(`${prefix} Unknown error:`, error);
  }
}

/**
 * Check if error should trigger a retry
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    // Server errors (5xx) are generally retryable
    return error.isServerError();
  }

  if (error instanceof NetworkError) {
    return true;
  }

  return false;
}

/**
 * Check if error is authentication related
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.statusCode === 401 || error.statusCode === 403;
  }
  return false;
}

/**
 * Format error for toast display
 */
export function formatErrorForToast(error: unknown): {
  title: string;
  message: string;
} {
  if (error instanceof AppError) {
    return {
      title: 'Error',
      message: error.getUserMessage(),
    };
  }

  if (error instanceof NetworkError) {
    return {
      title: 'Network Error',
      message: error.message,
    };
  }

  return {
    title: 'Error',
    message: getErrorMessage(error),
  };
}

/**
 * Export parseErrorResponse for convenience
 */
export { parseErrorResponse };
