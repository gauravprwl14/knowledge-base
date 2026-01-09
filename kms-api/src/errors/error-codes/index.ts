/**
 * Error Codes System
 *
 * Error codes follow the pattern: XXX0000
 * - XXX: 3-letter category prefix
 * - 0000: 4-digit sequential number
 *
 * Categories:
 * - GEN: General/Unknown errors
 * - VAL: Validation errors
 * - AUT: Authentication errors
 * - AUZ: Authorization errors
 * - DAT: Data/Database errors
 * - SRV: Server/Internal errors
 * - EXT: External service errors
 *
 * @example
 * ```typescript
 * import { ERROR_CODES, getErrorMessage } from '@errors/error-codes';
 *
 * throw ErrorFactory.validation(ERROR_CODES.VAL.INVALID_EMAIL);
 * ```
 */

/**
 * General Error Codes (GEN0000 - GEN9999)
 */
export const GEN_ERROR_CODES = {
  UNKNOWN: 'GEN0000',
  INTERNAL_ERROR: 'GEN0001',
  NOT_IMPLEMENTED: 'GEN0002',
  SERVICE_UNAVAILABLE: 'GEN0003',
  TIMEOUT: 'GEN0004',
  RATE_LIMITED: 'GEN0005',
  MAINTENANCE_MODE: 'GEN0006',
} as const;

/**
 * Validation Error Codes (VAL0000 - VAL9999)
 */
export const VAL_ERROR_CODES = {
  INVALID_INPUT: 'VAL0000',
  INVALID_EMAIL: 'VAL0001',
  INVALID_PASSWORD: 'VAL0002',
  INVALID_UUID: 'VAL0003',
  INVALID_DATE: 'VAL0004',
  INVALID_ENUM: 'VAL0005',
  REQUIRED_FIELD: 'VAL0006',
  FIELD_TOO_SHORT: 'VAL0007',
  FIELD_TOO_LONG: 'VAL0008',
  INVALID_FORMAT: 'VAL0009',
  INVALID_TYPE: 'VAL0010',
  INVALID_RANGE: 'VAL0011',
  INVALID_JSON: 'VAL0012',
  INVALID_API_KEY_FORMAT: 'VAL0013',
  INVALID_PAGINATION: 'VAL0014',
  PASSWORDS_DO_NOT_MATCH: 'VAL0015',
  WEAK_PASSWORD: 'VAL0016',
} as const;

/**
 * Authentication Error Codes (AUT0000 - AUT9999)
 */
export const AUT_ERROR_CODES = {
  UNAUTHENTICATED: 'AUT0000',
  INVALID_CREDENTIALS: 'AUT0001',
  TOKEN_EXPIRED: 'AUT0002',
  TOKEN_INVALID: 'AUT0003',
  TOKEN_REVOKED: 'AUT0004',
  REFRESH_TOKEN_EXPIRED: 'AUT0005',
  REFRESH_TOKEN_INVALID: 'AUT0006',
  API_KEY_INVALID: 'AUT0007',
  API_KEY_EXPIRED: 'AUT0008',
  API_KEY_REVOKED: 'AUT0009',
  SESSION_EXPIRED: 'AUT0010',
  ACCOUNT_LOCKED: 'AUT0011',
  ACCOUNT_NOT_VERIFIED: 'AUT0012',
  ACCOUNT_SUSPENDED: 'AUT0013',
  MFA_REQUIRED: 'AUT0014',
  MFA_INVALID: 'AUT0015',
  OAUTH_FAILED: 'AUT0016',
} as const;

/**
 * Authorization Error Codes (AUZ0000 - AUZ9999)
 */
export const AUZ_ERROR_CODES = {
  FORBIDDEN: 'AUZ0000',
  INSUFFICIENT_PERMISSIONS: 'AUZ0001',
  RESOURCE_ACCESS_DENIED: 'AUZ0002',
  ACTION_NOT_ALLOWED: 'AUZ0003',
  SCOPE_INSUFFICIENT: 'AUZ0004',
  ROLE_REQUIRED: 'AUZ0005',
  OWNERSHIP_REQUIRED: 'AUZ0006',
  IP_NOT_ALLOWED: 'AUZ0007',
} as const;

/**
 * Data/Database Error Codes (DAT0000 - DAT9999)
 */
export const DAT_ERROR_CODES = {
  NOT_FOUND: 'DAT0000',
  ALREADY_EXISTS: 'DAT0001',
  CONFLICT: 'DAT0002',
  CONSTRAINT_VIOLATION: 'DAT0003',
  FOREIGN_KEY_VIOLATION: 'DAT0004',
  UNIQUE_VIOLATION: 'DAT0005',
  TRANSACTION_FAILED: 'DAT0006',
  CONNECTION_FAILED: 'DAT0007',
  QUERY_FAILED: 'DAT0008',
  DATA_INTEGRITY_ERROR: 'DAT0009',
  RECORD_LOCKED: 'DAT0010',
  STALE_DATA: 'DAT0011',
  USER_NOT_FOUND: 'DAT0012',
  API_KEY_NOT_FOUND: 'DAT0013',
  SESSION_NOT_FOUND: 'DAT0014',
} as const;

/**
 * Server/Internal Error Codes (SRV0000 - SRV9999)
 */
export const SRV_ERROR_CODES = {
  INTERNAL_ERROR: 'SRV0000',
  CONFIGURATION_ERROR: 'SRV0001',
  DEPENDENCY_ERROR: 'SRV0002',
  RESOURCE_EXHAUSTED: 'SRV0003',
  QUEUE_ERROR: 'SRV0004',
  CACHE_ERROR: 'SRV0005',
  FILE_SYSTEM_ERROR: 'SRV0006',
  SERIALIZATION_ERROR: 'SRV0007',
  DESERIALIZATION_ERROR: 'SRV0008',
  STARTUP_ERROR: 'SRV0009',
  SHUTDOWN_ERROR: 'SRV0010',
  HEALTH_CHECK_FAILED: 'SRV0011',
} as const;

/**
 * External Service Error Codes (EXT0000 - EXT9999)
 */
export const EXT_ERROR_CODES = {
  SERVICE_ERROR: 'EXT0000',
  SERVICE_UNAVAILABLE: 'EXT0001',
  SERVICE_TIMEOUT: 'EXT0002',
  SERVICE_RATE_LIMITED: 'EXT0003',
  INVALID_RESPONSE: 'EXT0004',
  CONNECTION_REFUSED: 'EXT0005',
  DNS_RESOLUTION_FAILED: 'EXT0006',
  SSL_ERROR: 'EXT0007',
  API_VERSION_MISMATCH: 'EXT0008',
  WEBHOOK_FAILED: 'EXT0009',
  VOICE_APP_ERROR: 'EXT0010',
  SEARCH_API_ERROR: 'EXT0011',
} as const;

/**
 * Combined error codes object
 */
export const ERROR_CODES = {
  GEN: GEN_ERROR_CODES,
  VAL: VAL_ERROR_CODES,
  AUT: AUT_ERROR_CODES,
  AUZ: AUZ_ERROR_CODES,
  DAT: DAT_ERROR_CODES,
  SRV: SRV_ERROR_CODES,
  EXT: EXT_ERROR_CODES,
} as const;

/**
 * Error code type union
 */
export type ErrorCode =
  | (typeof GEN_ERROR_CODES)[keyof typeof GEN_ERROR_CODES]
  | (typeof VAL_ERROR_CODES)[keyof typeof VAL_ERROR_CODES]
  | (typeof AUT_ERROR_CODES)[keyof typeof AUT_ERROR_CODES]
  | (typeof AUZ_ERROR_CODES)[keyof typeof AUZ_ERROR_CODES]
  | (typeof DAT_ERROR_CODES)[keyof typeof DAT_ERROR_CODES]
  | (typeof SRV_ERROR_CODES)[keyof typeof SRV_ERROR_CODES]
  | (typeof EXT_ERROR_CODES)[keyof typeof EXT_ERROR_CODES];

/**
 * Default error messages for each error code
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // General
  [GEN_ERROR_CODES.UNKNOWN]: 'An unknown error occurred',
  [GEN_ERROR_CODES.INTERNAL_ERROR]: 'An internal error occurred',
  [GEN_ERROR_CODES.NOT_IMPLEMENTED]: 'This feature is not implemented',
  [GEN_ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable',
  [GEN_ERROR_CODES.TIMEOUT]: 'Request timed out',
  [GEN_ERROR_CODES.RATE_LIMITED]: 'Too many requests, please try again later',
  [GEN_ERROR_CODES.MAINTENANCE_MODE]: 'Service is under maintenance',

  // Validation
  [VAL_ERROR_CODES.INVALID_INPUT]: 'Invalid input provided',
  [VAL_ERROR_CODES.INVALID_EMAIL]: 'Invalid email address',
  [VAL_ERROR_CODES.INVALID_PASSWORD]: 'Invalid password',
  [VAL_ERROR_CODES.INVALID_UUID]: 'Invalid UUID format',
  [VAL_ERROR_CODES.INVALID_DATE]: 'Invalid date format',
  [VAL_ERROR_CODES.INVALID_ENUM]: 'Invalid enum value',
  [VAL_ERROR_CODES.REQUIRED_FIELD]: 'Required field is missing',
  [VAL_ERROR_CODES.FIELD_TOO_SHORT]: 'Field value is too short',
  [VAL_ERROR_CODES.FIELD_TOO_LONG]: 'Field value is too long',
  [VAL_ERROR_CODES.INVALID_FORMAT]: 'Invalid format',
  [VAL_ERROR_CODES.INVALID_TYPE]: 'Invalid type',
  [VAL_ERROR_CODES.INVALID_RANGE]: 'Value is out of range',
  [VAL_ERROR_CODES.INVALID_JSON]: 'Invalid JSON',
  [VAL_ERROR_CODES.INVALID_API_KEY_FORMAT]: 'Invalid API key format',
  [VAL_ERROR_CODES.INVALID_PAGINATION]: 'Invalid pagination parameters',
  [VAL_ERROR_CODES.PASSWORDS_DO_NOT_MATCH]: 'Passwords do not match',
  [VAL_ERROR_CODES.WEAK_PASSWORD]: 'Password does not meet security requirements',

  // Authentication
  [AUT_ERROR_CODES.UNAUTHENTICATED]: 'Authentication required',
  [AUT_ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid credentials',
  [AUT_ERROR_CODES.TOKEN_EXPIRED]: 'Access token has expired',
  [AUT_ERROR_CODES.TOKEN_INVALID]: 'Invalid access token',
  [AUT_ERROR_CODES.TOKEN_REVOKED]: 'Access token has been revoked',
  [AUT_ERROR_CODES.REFRESH_TOKEN_EXPIRED]: 'Refresh token has expired',
  [AUT_ERROR_CODES.REFRESH_TOKEN_INVALID]: 'Invalid refresh token',
  [AUT_ERROR_CODES.API_KEY_INVALID]: 'Invalid API key',
  [AUT_ERROR_CODES.API_KEY_EXPIRED]: 'API key has expired',
  [AUT_ERROR_CODES.API_KEY_REVOKED]: 'API key has been revoked',
  [AUT_ERROR_CODES.SESSION_EXPIRED]: 'Session has expired',
  [AUT_ERROR_CODES.ACCOUNT_LOCKED]: 'Account is locked',
  [AUT_ERROR_CODES.ACCOUNT_NOT_VERIFIED]: 'Account email is not verified',
  [AUT_ERROR_CODES.ACCOUNT_SUSPENDED]: 'Account has been suspended',
  [AUT_ERROR_CODES.MFA_REQUIRED]: 'Multi-factor authentication required',
  [AUT_ERROR_CODES.MFA_INVALID]: 'Invalid MFA code',
  [AUT_ERROR_CODES.OAUTH_FAILED]: 'OAuth authentication failed',

  // Authorization
  [AUZ_ERROR_CODES.FORBIDDEN]: 'Access forbidden',
  [AUZ_ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'Insufficient permissions',
  [AUZ_ERROR_CODES.RESOURCE_ACCESS_DENIED]: 'Access to resource denied',
  [AUZ_ERROR_CODES.ACTION_NOT_ALLOWED]: 'Action not allowed',
  [AUZ_ERROR_CODES.SCOPE_INSUFFICIENT]: 'Insufficient scope',
  [AUZ_ERROR_CODES.ROLE_REQUIRED]: 'Required role not present',
  [AUZ_ERROR_CODES.OWNERSHIP_REQUIRED]: 'Resource ownership required',
  [AUZ_ERROR_CODES.IP_NOT_ALLOWED]: 'IP address not allowed',

  // Data
  [DAT_ERROR_CODES.NOT_FOUND]: 'Resource not found',
  [DAT_ERROR_CODES.ALREADY_EXISTS]: 'Resource already exists',
  [DAT_ERROR_CODES.CONFLICT]: 'Resource conflict',
  [DAT_ERROR_CODES.CONSTRAINT_VIOLATION]: 'Database constraint violation',
  [DAT_ERROR_CODES.FOREIGN_KEY_VIOLATION]: 'Foreign key constraint violation',
  [DAT_ERROR_CODES.UNIQUE_VIOLATION]: 'Unique constraint violation',
  [DAT_ERROR_CODES.TRANSACTION_FAILED]: 'Database transaction failed',
  [DAT_ERROR_CODES.CONNECTION_FAILED]: 'Database connection failed',
  [DAT_ERROR_CODES.QUERY_FAILED]: 'Database query failed',
  [DAT_ERROR_CODES.DATA_INTEGRITY_ERROR]: 'Data integrity error',
  [DAT_ERROR_CODES.RECORD_LOCKED]: 'Record is locked',
  [DAT_ERROR_CODES.STALE_DATA]: 'Data has been modified',
  [DAT_ERROR_CODES.USER_NOT_FOUND]: 'User not found',
  [DAT_ERROR_CODES.API_KEY_NOT_FOUND]: 'API key not found',
  [DAT_ERROR_CODES.SESSION_NOT_FOUND]: 'Session not found',

  // Server
  [SRV_ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
  [SRV_ERROR_CODES.CONFIGURATION_ERROR]: 'Configuration error',
  [SRV_ERROR_CODES.DEPENDENCY_ERROR]: 'Service dependency error',
  [SRV_ERROR_CODES.RESOURCE_EXHAUSTED]: 'Server resources exhausted',
  [SRV_ERROR_CODES.QUEUE_ERROR]: 'Queue processing error',
  [SRV_ERROR_CODES.CACHE_ERROR]: 'Cache operation error',
  [SRV_ERROR_CODES.FILE_SYSTEM_ERROR]: 'File system error',
  [SRV_ERROR_CODES.SERIALIZATION_ERROR]: 'Serialization error',
  [SRV_ERROR_CODES.DESERIALIZATION_ERROR]: 'Deserialization error',
  [SRV_ERROR_CODES.STARTUP_ERROR]: 'Service startup error',
  [SRV_ERROR_CODES.SHUTDOWN_ERROR]: 'Service shutdown error',
  [SRV_ERROR_CODES.HEALTH_CHECK_FAILED]: 'Health check failed',

  // External
  [EXT_ERROR_CODES.SERVICE_ERROR]: 'External service error',
  [EXT_ERROR_CODES.SERVICE_UNAVAILABLE]: 'External service unavailable',
  [EXT_ERROR_CODES.SERVICE_TIMEOUT]: 'External service timeout',
  [EXT_ERROR_CODES.SERVICE_RATE_LIMITED]: 'External service rate limited',
  [EXT_ERROR_CODES.INVALID_RESPONSE]: 'Invalid response from external service',
  [EXT_ERROR_CODES.CONNECTION_REFUSED]: 'Connection refused by external service',
  [EXT_ERROR_CODES.DNS_RESOLUTION_FAILED]: 'DNS resolution failed',
  [EXT_ERROR_CODES.SSL_ERROR]: 'SSL/TLS error',
  [EXT_ERROR_CODES.API_VERSION_MISMATCH]: 'API version mismatch',
  [EXT_ERROR_CODES.WEBHOOK_FAILED]: 'Webhook delivery failed',
  [EXT_ERROR_CODES.VOICE_APP_ERROR]: 'Voice App service error',
  [EXT_ERROR_CODES.SEARCH_API_ERROR]: 'Search API service error',
};

/**
 * Gets the default message for an error code
 * @param code - The error code
 * @returns The default error message
 */
export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[GEN_ERROR_CODES.UNKNOWN];
}

/**
 * Gets the HTTP status code for an error code
 * @param code - The error code
 * @returns The HTTP status code
 */
export function getHttpStatusForCode(code: ErrorCode): number {
  const prefix = code.substring(0, 3);

  switch (prefix) {
    case 'VAL':
      return 400; // Bad Request
    case 'AUT':
      return 401; // Unauthorized
    case 'AUZ':
      return 403; // Forbidden
    case 'DAT':
      if (code === DAT_ERROR_CODES.NOT_FOUND) return 404;
      if (code === DAT_ERROR_CODES.CONFLICT || code === DAT_ERROR_CODES.ALREADY_EXISTS)
        return 409;
      return 400;
    case 'GEN':
      if (code === GEN_ERROR_CODES.RATE_LIMITED) return 429;
      if (code === GEN_ERROR_CODES.SERVICE_UNAVAILABLE) return 503;
      if (code === GEN_ERROR_CODES.TIMEOUT) return 504;
      return 500;
    case 'SRV':
      return 500; // Internal Server Error
    case 'EXT':
      if (code === EXT_ERROR_CODES.SERVICE_UNAVAILABLE) return 503;
      if (code === EXT_ERROR_CODES.SERVICE_TIMEOUT) return 504;
      return 502; // Bad Gateway
    default:
      return 500;
  }
}
