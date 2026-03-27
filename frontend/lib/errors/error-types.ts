/**
 * Error Types
 * Categories of errors based on their nature
 */
export const ErrorType = {
  VALIDATION: 'VALIDATION',
  SYSTEM: 'SYSTEM',
  NETWORK: 'NETWORK',
  AUTHENTICATION: 'AUTHENTICATION',
  AUTHORIZATION: 'AUTHORIZATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT: 'RATE_LIMIT',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorType = (typeof ErrorType)[keyof typeof ErrorType];
