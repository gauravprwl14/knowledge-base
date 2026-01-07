/**
 * Error Categories
 * Where the error originated
 */
export const ErrorCategory = {
  CLIENT: 'CLIENT', // Client-side errors (validation, UI, etc.)
  SERVER: 'SERVER', // Server-side errors (API, database, etc.)
  NETWORK: 'NETWORK', // Network-related errors
  EXTERNAL: 'EXTERNAL', // Third-party service errors
} as const;

export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory];
