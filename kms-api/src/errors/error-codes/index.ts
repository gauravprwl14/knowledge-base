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
 * - WFL: Workflow engine errors
 *
 * Each error definition includes:
 * - code: Unique error identifier
 * - message: Human-readable error message
 * - httpStatus: HTTP status code
 * - severity: Error severity level
 * - retryable: Whether the operation can be retried
 * - userFacing: Whether safe to show to end users
 *
 * @example
 * ```typescript
 * import { ERROR_CODES, ErrorDefinition } from '@errors/error-codes';
 *
 * const error = ERROR_CODES.VAL.INVALID_EMAIL;
 * console.log(error.code); // 'VAL0001'
 * console.log(error.message); // 'Invalid email address'
 * console.log(error.httpStatus); // 400
 * ```
 */

/**
 * Error severity levels
 */
export type ErrorSeverity = 'ERROR' | 'WARNING' | 'INFO';

/**
 * Error definition with rich metadata
 */
export interface ErrorDefinition {
  /** Unique error code (e.g., 'VAL0001') */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** HTTP status code */
  readonly httpStatus: number;
  /** Error severity level */
  readonly severity: ErrorSeverity;
  /** Whether the operation can be retried */
  readonly retryable: boolean;
  /** Whether safe to show to end users */
  readonly userFacing: boolean;
}

/**
 * General Error Codes (GEN0000 - GEN9999)
 */
export const GEN_ERROR_CODES = {
  UNKNOWN: {
    code: 'GEN0000',
    message: 'An unknown error occurred',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INTERNAL_ERROR: {
    code: 'GEN0001',
    message: 'An internal error occurred',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  NOT_IMPLEMENTED: {
    code: 'GEN0002',
    message: 'This feature is not implemented',
    httpStatus: 501,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  SERVICE_UNAVAILABLE: {
    code: 'GEN0003',
    message: 'Service is temporarily unavailable',
    httpStatus: 503,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  TIMEOUT: {
    code: 'GEN0004',
    message: 'Request timed out',
    httpStatus: 504,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  RATE_LIMITED: {
    code: 'GEN0005',
    message: 'Too many requests, please try again later',
    httpStatus: 429,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  MAINTENANCE_MODE: {
    code: 'GEN0006',
    message: 'Service is under maintenance',
    httpStatus: 503,
    severity: 'INFO',
    retryable: true,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Validation Error Codes (VAL0000 - VAL9999)
 */
export const VAL_ERROR_CODES = {
  INVALID_INPUT: {
    code: 'VAL0000',
    message: 'Invalid input provided',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_EMAIL: {
    code: 'VAL0001',
    message: 'Invalid email address',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_PASSWORD: {
    code: 'VAL0002',
    message: 'Invalid password',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_UUID: {
    code: 'VAL0003',
    message: 'Invalid UUID format',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_DATE: {
    code: 'VAL0004',
    message: 'Invalid date format',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_ENUM: {
    code: 'VAL0005',
    message: 'Invalid enum value',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  REQUIRED_FIELD: {
    code: 'VAL0006',
    message: 'Required field is missing',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  FIELD_TOO_SHORT: {
    code: 'VAL0007',
    message: 'Field value is too short',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  FIELD_TOO_LONG: {
    code: 'VAL0008',
    message: 'Field value is too long',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_FORMAT: {
    code: 'VAL0009',
    message: 'Invalid format',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_TYPE: {
    code: 'VAL0010',
    message: 'Invalid type',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_RANGE: {
    code: 'VAL0011',
    message: 'Value is out of range',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_JSON: {
    code: 'VAL0012',
    message: 'Invalid JSON',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_API_KEY_FORMAT: {
    code: 'VAL0013',
    message: 'Invalid API key format',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_PAGINATION: {
    code: 'VAL0014',
    message: 'Invalid pagination parameters',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  PASSWORDS_DO_NOT_MATCH: {
    code: 'VAL0015',
    message: 'Passwords do not match',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  WEAK_PASSWORD: {
    code: 'VAL0016',
    message: 'Password does not meet security requirements',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Authentication Error Codes (AUT0000 - AUT9999)
 */
export const AUT_ERROR_CODES = {
  UNAUTHENTICATED: {
    code: 'AUT0000',
    message: 'Authentication required',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INVALID_CREDENTIALS: {
    code: 'AUT0001',
    message: 'Invalid credentials',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  TOKEN_EXPIRED: {
    code: 'AUT0002',
    message: 'Access token has expired',
    httpStatus: 401,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  TOKEN_INVALID: {
    code: 'AUT0003',
    message: 'Invalid access token',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  TOKEN_REVOKED: {
    code: 'AUT0004',
    message: 'Access token has been revoked',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  REFRESH_TOKEN_EXPIRED: {
    code: 'AUT0005',
    message: 'Refresh token has expired',
    httpStatus: 401,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  REFRESH_TOKEN_INVALID: {
    code: 'AUT0006',
    message: 'Invalid refresh token',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  API_KEY_INVALID: {
    code: 'AUT0007',
    message: 'Invalid API key',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  API_KEY_EXPIRED: {
    code: 'AUT0008',
    message: 'API key has expired',
    httpStatus: 401,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  API_KEY_REVOKED: {
    code: 'AUT0009',
    message: 'API key has been revoked',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  SESSION_EXPIRED: {
    code: 'AUT0010',
    message: 'Session has expired',
    httpStatus: 401,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  ACCOUNT_LOCKED: {
    code: 'AUT0011',
    message: 'Account is locked',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  ACCOUNT_NOT_VERIFIED: {
    code: 'AUT0012',
    message: 'Account email is not verified',
    httpStatus: 403,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  ACCOUNT_SUSPENDED: {
    code: 'AUT0013',
    message: 'Account has been suspended',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  MFA_REQUIRED: {
    code: 'AUT0014',
    message: 'Multi-factor authentication required',
    httpStatus: 401,
    severity: 'INFO',
    retryable: false,
    userFacing: true,
  },
  MFA_INVALID: {
    code: 'AUT0015',
    message: 'Invalid MFA code',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  OAUTH_FAILED: {
    code: 'AUT0016',
    message: 'OAuth authentication failed',
    httpStatus: 401,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  ADMIN_ACCESS_REQUIRED: {
    code: 'KBAUT0010',
    message: 'Admin access required',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Authorization Error Codes (AUZ0000 - AUZ9999)
 */
export const AUZ_ERROR_CODES = {
  FORBIDDEN: {
    code: 'AUZ0000',
    message: 'Access forbidden',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  INSUFFICIENT_PERMISSIONS: {
    code: 'AUZ0001',
    message: 'Insufficient permissions',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  RESOURCE_ACCESS_DENIED: {
    code: 'AUZ0002',
    message: 'Access to resource denied',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  ACTION_NOT_ALLOWED: {
    code: 'AUZ0003',
    message: 'Action not allowed',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  SCOPE_INSUFFICIENT: {
    code: 'AUZ0004',
    message: 'Insufficient scope',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  ROLE_REQUIRED: {
    code: 'AUZ0005',
    message: 'Required role not present',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  OWNERSHIP_REQUIRED: {
    code: 'AUZ0006',
    message: 'Resource ownership required',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  IP_NOT_ALLOWED: {
    code: 'AUZ0007',
    message: 'IP address not allowed',
    httpStatus: 403,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Data/Database Error Codes (DAT0000 - DAT9999)
 */
export const DAT_ERROR_CODES = {
  NOT_FOUND: {
    code: 'DAT0000',
    message: 'Resource not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  ALREADY_EXISTS: {
    code: 'DAT0001',
    message: 'Resource already exists',
    httpStatus: 409,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  CONFLICT: {
    code: 'DAT0002',
    message: 'Resource conflict',
    httpStatus: 409,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  CONSTRAINT_VIOLATION: {
    code: 'DAT0003',
    message: 'Database constraint violation',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  FOREIGN_KEY_VIOLATION: {
    code: 'DAT0004',
    message: 'Foreign key constraint violation',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  UNIQUE_VIOLATION: {
    code: 'DAT0005',
    message: 'Unique constraint violation',
    httpStatus: 409,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  TRANSACTION_FAILED: {
    code: 'DAT0006',
    message: 'Database transaction failed',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  CONNECTION_FAILED: {
    code: 'DAT0007',
    message: 'Database connection failed',
    httpStatus: 503,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  QUERY_FAILED: {
    code: 'DAT0008',
    message: 'Database query failed',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  DATA_INTEGRITY_ERROR: {
    code: 'DAT0009',
    message: 'Data integrity error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  RECORD_LOCKED: {
    code: 'DAT0010',
    message: 'Record is locked',
    httpStatus: 409,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  STALE_DATA: {
    code: 'DAT0011',
    message: 'Data has been modified',
    httpStatus: 409,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  USER_NOT_FOUND: {
    code: 'DAT0012',
    message: 'User not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  API_KEY_NOT_FOUND: {
    code: 'DAT0013',
    message: 'API key not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  SESSION_NOT_FOUND: {
    code: 'DAT0014',
    message: 'Session not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Server/Internal Error Codes (SRV0000 - SRV9999)
 */
export const SRV_ERROR_CODES = {
  INTERNAL_ERROR: {
    code: 'SRV0000',
    message: 'Internal server error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  CONFIGURATION_ERROR: {
    code: 'SRV0001',
    message: 'Configuration error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  DEPENDENCY_ERROR: {
    code: 'SRV0002',
    message: 'Service dependency error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  RESOURCE_EXHAUSTED: {
    code: 'SRV0003',
    message: 'Server resources exhausted',
    httpStatus: 503,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  QUEUE_ERROR: {
    code: 'SRV0004',
    message: 'Queue processing error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  CACHE_ERROR: {
    code: 'SRV0005',
    message: 'Cache operation error',
    httpStatus: 500,
    severity: 'WARNING',
    retryable: true,
    userFacing: false,
  },
  FILE_SYSTEM_ERROR: {
    code: 'SRV0006',
    message: 'File system error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  SERIALIZATION_ERROR: {
    code: 'SRV0007',
    message: 'Serialization error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  DESERIALIZATION_ERROR: {
    code: 'SRV0008',
    message: 'Deserialization error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  STARTUP_ERROR: {
    code: 'SRV0009',
    message: 'Service startup error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  SHUTDOWN_ERROR: {
    code: 'SRV0010',
    message: 'Service shutdown error',
    httpStatus: 500,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  HEALTH_CHECK_FAILED: {
    code: 'SRV0011',
    message: 'Health check failed',
    httpStatus: 503,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * External Service Error Codes (EXT0000 - EXT9999)
 */
export const EXT_ERROR_CODES = {
  SERVICE_ERROR: {
    code: 'EXT0000',
    message: 'External service error',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  SERVICE_UNAVAILABLE: {
    code: 'EXT0001',
    message: 'External service unavailable',
    httpStatus: 503,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  SERVICE_TIMEOUT: {
    code: 'EXT0002',
    message: 'External service timeout',
    httpStatus: 504,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  SERVICE_RATE_LIMITED: {
    code: 'EXT0003',
    message: 'External service rate limited',
    httpStatus: 429,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
  INVALID_RESPONSE: {
    code: 'EXT0004',
    message: 'Invalid response from external service',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  CONNECTION_REFUSED: {
    code: 'EXT0005',
    message: 'Connection refused by external service',
    httpStatus: 503,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  DNS_RESOLUTION_FAILED: {
    code: 'EXT0006',
    message: 'DNS resolution failed',
    httpStatus: 503,
    severity: 'ERROR',
    retryable: true,
    userFacing: false,
  },
  SSL_ERROR: {
    code: 'EXT0007',
    message: 'SSL/TLS error',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  API_VERSION_MISMATCH: {
    code: 'EXT0008',
    message: 'API version mismatch',
    httpStatus: 400,
    severity: 'ERROR',
    retryable: false,
    userFacing: false,
  },
  WEBHOOK_FAILED: {
    code: 'EXT0009',
    message: 'Webhook delivery failed',
    httpStatus: 502,
    severity: 'WARNING',
    retryable: true,
    userFacing: false,
  },
  VOICE_APP_ERROR: {
    code: 'EXT0010',
    message: 'Voice App service error',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  SEARCH_API_ERROR: {
    code: 'EXT0011',
    message: 'Search API service error',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  ACP_SESSION_NOT_FOUND: {
    code: 'EXT0012',
    message: 'ACP session not found or expired',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  ANTHROPIC_ERROR: {
    code: 'EXT0013',
    message: 'Anthropic API error',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  CODEX_SESSION_FAILED: {
    code: 'EXT0014',
    message: 'OpenAI Codex session could not be established',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  CODEX_PROMPT_FAILED: {
    code: 'EXT0015',
    message: 'OpenAI Codex prompt request failed',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  CODEX_STREAM_FAILED: {
    code: 'EXT0016',
    message: 'OpenAI Codex response stream interrupted',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  GEMINI_SESSION_FAILED: {
    code: 'EXT0017',
    message: 'Google Gemini session could not be established',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  GEMINI_PROMPT_FAILED: {
    code: 'EXT0018',
    message: 'Google Gemini prompt request failed',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  GEMINI_STREAM_FAILED: {
    code: 'EXT0019',
    message: 'Google Gemini response stream interrupted',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Workflow Engine Error Codes (WFL0000 - WFL9999)
 *
 * Used by WorkflowService, WorkflowProcessor, and ContentStoreService.
 */
export const WFL_ERROR_CODES = {
  /**
   * KBWFL0001 — Workflow job not found.
   * Returned by GET /workflow/jobs/:jobId when the job ID was never valid
   * or has since been cleaned up.
   */
  WORKFLOW_JOB_NOT_FOUND: {
    code: 'KBWFL0001',
    message: 'Workflow job not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  /**
   * KBWFL0002 — url-agent service unavailable.
   * Raised when all retry attempts to POST url-agent /api/v1/urls/ingest fail.
   */
  URL_AGENT_UNAVAILABLE: {
    code: 'KBWFL0002',
    message: 'URL agent service is unavailable',
    httpStatus: 502,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Worker / Agent Error Codes (WRK0000 - WRK9999)
 *
 * Used by AcpToolRegistry and agent orchestration infrastructure.
 */
export const WRK_ERROR_CODES = {
  /**
   * KBWRK0020 — Agent spawn depth limit exceeded.
   * Raised when kms_spawn_agent is called from an agent already at depth 2
   * (the maximum per ADR-0022). Sub-agents at depth 2 cannot spawn further agents.
   */
  SPAWN_DEPTH_EXCEEDED: {
    code: 'KBWRK0020',
    message: 'Agent spawn depth limit exceeded',
    httpStatus: 422,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * File Error Codes (FIL0000 - FIL9999)
 */
export const FIL_ERROR_CODES = {
  FILE_NOT_FOUND: {
    code: 'FIL0001',
    message: 'File not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  BULK_LIMIT_EXCEEDED: {
    code: 'FIL0002',
    message: 'Bulk operation exceeds maximum of 100 files',
    httpStatus: 422,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Graph/Neo4j Error Codes (KBGRP0000 - KBGRP9999)
 *
 * Used by GraphService and Neo4jService when Neo4j queries fail or graph
 * data cannot be retrieved.
 */
export const GRP_ERROR_CODES = {
  /**
   * KBGRP0001 — Neo4j query execution failed.
   * Raised when a Cypher query returns an error from the Neo4j driver.
   * Typically indicates a schema mismatch, connection loss, or syntax error.
   */
  GRAPH_QUERY_FAILED: {
    code: 'KBGRP0001',
    message: 'Graph query failed',
    httpStatus: 502,
    severity: 'ERROR',
    retryable: true,
    userFacing: true,
  },
  /**
   * KBGRP0002 — Neo4j driver not available.
   * Raised when NEO4J_URI/USER/PASSWORD are unset and graph feature is required.
   */
  GRAPH_UNAVAILABLE: {
    code: 'KBGRP0002',
    message: 'Graph service is unavailable',
    httpStatus: 503,
    severity: 'WARNING',
    retryable: true,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

/**
 * Tag Error Codes (TAG0000 - TAG9999)
 */
export const TAG_ERROR_CODES = {
  TAG_NOT_FOUND: {
    code: 'TAG0001',
    message: 'Tag not found',
    httpStatus: 404,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
  TAG_NAME_CONFLICT: {
    code: 'TAG0002',
    message: 'A tag with this name already exists',
    httpStatus: 409,
    severity: 'ERROR',
    retryable: false,
    userFacing: true,
  },
  TAG_LIMIT_EXCEEDED: {
    code: 'TAG0003',
    message: 'Maximum tag limit (50) reached for this user',
    httpStatus: 400,
    severity: 'WARNING',
    retryable: false,
    userFacing: true,
  },
} as const satisfies Record<string, ErrorDefinition>;

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
  WFL: WFL_ERROR_CODES,
  WRK: WRK_ERROR_CODES,
  FIL: FIL_ERROR_CODES,
  TAG: TAG_ERROR_CODES,
  GRP: GRP_ERROR_CODES,
} as const;

/**
 * Error code type union (extracts just the code string)
 */
export type ErrorCode =
  | (typeof GEN_ERROR_CODES)[keyof typeof GEN_ERROR_CODES]['code']
  | (typeof VAL_ERROR_CODES)[keyof typeof VAL_ERROR_CODES]['code']
  | (typeof AUT_ERROR_CODES)[keyof typeof AUT_ERROR_CODES]['code']
  | (typeof AUZ_ERROR_CODES)[keyof typeof AUZ_ERROR_CODES]['code']
  | (typeof DAT_ERROR_CODES)[keyof typeof DAT_ERROR_CODES]['code']
  | (typeof SRV_ERROR_CODES)[keyof typeof SRV_ERROR_CODES]['code']
  | (typeof EXT_ERROR_CODES)[keyof typeof EXT_ERROR_CODES]['code']
  | (typeof WFL_ERROR_CODES)[keyof typeof WFL_ERROR_CODES]['code']
  | (typeof WRK_ERROR_CODES)[keyof typeof WRK_ERROR_CODES]['code']
  | (typeof FIL_ERROR_CODES)[keyof typeof FIL_ERROR_CODES]['code']
  | (typeof TAG_ERROR_CODES)[keyof typeof TAG_ERROR_CODES]['code']
  | (typeof GRP_ERROR_CODES)[keyof typeof GRP_ERROR_CODES]['code'];


/**
 * Helper type to extract error definition from error codes object
 */
type ExtractErrorDef<T> = T extends Record<string, infer U> ? U : never;

/**
 * Type representing any error definition
 */
export type AnyErrorDefinition =
  | ExtractErrorDef<typeof GEN_ERROR_CODES>
  | ExtractErrorDef<typeof VAL_ERROR_CODES>
  | ExtractErrorDef<typeof AUT_ERROR_CODES>
  | ExtractErrorDef<typeof AUZ_ERROR_CODES>
  | ExtractErrorDef<typeof DAT_ERROR_CODES>
  | ExtractErrorDef<typeof SRV_ERROR_CODES>
  | ExtractErrorDef<typeof EXT_ERROR_CODES>
  | ExtractErrorDef<typeof WFL_ERROR_CODES>
  | ExtractErrorDef<typeof WRK_ERROR_CODES>
  | ExtractErrorDef<typeof FIL_ERROR_CODES>
  | ExtractErrorDef<typeof TAG_ERROR_CODES>
  | ExtractErrorDef<typeof GRP_ERROR_CODES>;

/**
 * Gets the error definition for a given error code
 * @param code - The error code
 * @returns The error definition or undefined if not found
 */
export function getErrorDefinition(code: ErrorCode): ErrorDefinition | undefined {
  for (const category of Object.values(ERROR_CODES)) {
    for (const errorDef of Object.values(category)) {
      if (errorDef.code === code) {
        return errorDef;
      }
    }
  }
  return undefined;
}

/**
 * Gets the default message for an error code
 * @param code - The error code
 * @returns The default error message
 * @deprecated Use error definition's message property instead
 */
export function getErrorMessage(code: ErrorCode): string {
  const definition = getErrorDefinition(code);
  return definition?.message || 'An unknown error occurred';
}

/**
 * Gets the HTTP status code for an error code
 * @param code - The error code
 * @returns The HTTP status code
 * @deprecated Use error definition's httpStatus property instead
 */
export function getHttpStatusForCode(code: ErrorCode): number {
  const definition = getErrorDefinition(code);
  return definition?.httpStatus || 500;
}
