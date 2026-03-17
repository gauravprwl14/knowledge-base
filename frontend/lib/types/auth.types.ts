/**
 * Auth Types — shared type definitions for authentication flows.
 *
 * These mirror the API request/response shapes from lib/api/index.ts
 * and are used across hooks, feature components, and composite UI.
 */

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  avatarUrl?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Auth requests
// ---------------------------------------------------------------------------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  /** Derived from name field — firstName + lastName joined */
  firstName?: string;
  lastName?: string;
}

// ---------------------------------------------------------------------------
// Auth responses
// ---------------------------------------------------------------------------

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  name: string;
  /** Prefix of the key shown in UI (e.g. "kms_abc123...") */
  prefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface CreateApiKeyRequest {
  name: string;
  /** ISO date string for expiry, or null for never */
  expiresAt?: string | null;
}

export interface CreateApiKeyResponse {
  /** Full key — shown only once at creation */
  key: string;
  apiKey: ApiKey;
}
