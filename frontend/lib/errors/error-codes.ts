/**
 * Error Code Prefixes
 * Format: PREFIX + 4-digit code
 */
export const ErrorPrefix = {
  GEN: 'GEN', // General errors
  VAL: 'VAL', // Validation errors
  DAB: 'DAB', // Database errors
  API: 'API', // API errors
  UNK: 'UNK', // Unknown errors
  KB: 'KB', // Knowledge Base errors
  DRV: 'DRV', // Google Drive errors
  OBS: 'OBS', // Obsidian errors
  TRN: 'TRN', // Transcription errors
  BMK: 'BMK', // Bookmark errors
  PRM: 'PRM', // Prompt errors
} as const;

export type ErrorPrefix = (typeof ErrorPrefix)[keyof typeof ErrorPrefix];

/**
 * Common error codes
 */
export const CommonErrorCodes = {
  // General errors (GEN)
  GEN1000: 'GEN1000', // Unknown error
  GEN1001: 'GEN1001', // Internal server error
  GEN1002: 'GEN1002', // Service unavailable

  // Validation errors (VAL)
  VAL2000: 'VAL2000', // Invalid input
  VAL2001: 'VAL2001', // Required field missing
  VAL2002: 'VAL2002', // Invalid format
  VAL2003: 'VAL2003', // Value out of range

  // API errors (API)
  API3000: 'API3000', // API request failed
  API3001: 'API3001', // API timeout
  API3002: 'API3002', // API rate limit exceeded
  API3003: 'API3003', // API authentication failed
  API3004: 'API3004', // API not found

  // Network errors (NET)
  NET4000: 'NET4000', // Network error
  NET4001: 'NET4001', // Connection timeout
  NET4002: 'NET4002', // No internet connection
} as const;

export type CommonErrorCode = (typeof CommonErrorCodes)[keyof typeof CommonErrorCodes];
