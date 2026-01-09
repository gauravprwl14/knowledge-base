/**
 * Application Constants
 *
 * Central location for all application-wide constants.
 * Use these instead of magic strings/numbers throughout the codebase.
 */

/**
 * HTTP Status codes commonly used in the API
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/**
 * API versioning constants
 */
export const API = {
  CURRENT_VERSION: 'v1',
  PREFIX: 'api',
  FULL_PREFIX: 'api/v1',
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  MIN_LIMIT: 1,
} as const;

/**
 * Authentication constants
 */
export const AUTH = {
  API_KEY_HEADER: 'x-api-key',
  AUTHORIZATION_HEADER: 'authorization',
  BEARER_PREFIX: 'Bearer',
  API_KEY_PREFIX: 'kms_',
  API_KEY_PREFIX_LENGTH: 8,
  MAX_API_KEYS_PER_USER: 10,
  MAX_FAILED_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_DURATION_MINUTES: 30,
} as const;

/**
 * Rate limiting constants
 */
export const RATE_LIMIT = {
  DEFAULT_TTL: 60,
  DEFAULT_LIMIT: 100,
  AUTH_TTL: 60,
  AUTH_LIMIT: 10,
} as const;

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
  USER_SESSION: 900, // 15 minutes
  API_KEY: 300, // 5 minutes
} as const;

/**
 * Queue constants
 */
export const QUEUE = {
  DEFAULT_EXCHANGE: 'kms.direct',
  DEAD_LETTER_EXCHANGE: 'kms.dlx',
  DEFAULT_QUEUE: 'kms.default',
  PRIORITY_QUEUE: 'kms.priority',
  FAILED_QUEUE: 'kms.failed',
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 5000,
} as const;

/**
 * Audit action constants
 */
export const AUDIT_ACTIONS = {
  // User actions
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_LOGIN_FAILED: 'user.login_failed',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  // API key actions
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  API_KEY_USED: 'api_key.used',
  // System actions
  SYSTEM_STARTUP: 'system.startup',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  HEALTH_CHECK: 'health.check',
} as const;

/**
 * Resource names for audit logging
 */
export const AUDIT_RESOURCES = {
  USER: 'user',
  API_KEY: 'api_key',
  SESSION: 'session',
  SYSTEM: 'system',
} as const;

/**
 * Regex patterns for validation
 */
export const PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PASSWORD_STRONG:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  API_KEY: /^kms_[A-Za-z0-9_-]{32,}$/,
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
} as const;

/**
 * Security headers
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
} as const;

/**
 * Request context keys
 */
export const REQUEST_CONTEXT = {
  USER: 'user',
  API_KEY: 'apiKey',
  TRACE_ID: 'traceId',
  SPAN_ID: 'spanId',
  REQUEST_ID: 'requestId',
  START_TIME: 'startTime',
} as const;

/**
 * Environment names
 */
export const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  TEST: 'test',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;
