/**
 * Common Types — shared utility types used across the KMS frontend.
 */

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T;
  message?: string;
  statusCode?: number;
}

// ---------------------------------------------------------------------------
// API error shape
// ---------------------------------------------------------------------------

export interface ApiError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';
