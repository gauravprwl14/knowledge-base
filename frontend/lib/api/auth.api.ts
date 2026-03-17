/**
 * Auth API — typed wrappers over the KMS auth endpoints.
 *
 * All functions use the shared apiClient singleton which handles:
 * - Bearer token injection
 * - Silent token refresh on 401
 * - Normalised ApiError on failure
 */

import { apiClient } from './client';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

/**
 * POST /auth/login
 * Returns access token; refresh token is set as httpOnly cookie by the server.
 */
export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/auth/login', credentials);
}

/**
 * POST /auth/register
 * Creates a new user account. Backend will send a verification email.
 * Does NOT return an access token — user must verify before logging in.
 */
export async function register(payload: RegisterRequest): Promise<User> {
  return apiClient.post<User>('/auth/register', {
    email: payload.email,
    password: payload.password,
    name: payload.name,
  });
}

/**
 * POST /auth/logout
 * Invalidates the refresh token cookie on the server.
 */
export async function logout(): Promise<void> {
  return apiClient.post<void>('/auth/logout');
}

/**
 * GET /auth/me
 * Returns the currently authenticated user's profile.
 */
export async function getMe(): Promise<User> {
  return apiClient.get<User>('/auth/me');
}

// ---------------------------------------------------------------------------
// API Keys endpoints
// ---------------------------------------------------------------------------

/**
 * GET /auth/api-keys
 * Lists all API keys for the authenticated user.
 */
export async function listApiKeys(): Promise<ApiKey[]> {
  return apiClient.get<ApiKey[]>('/auth/api-keys');
}

/**
 * POST /auth/api-keys
 * Creates a new API key. The full key value is returned once — store it.
 */
export async function createApiKey(
  payload: CreateApiKeyRequest,
): Promise<CreateApiKeyResponse> {
  return apiClient.post<CreateApiKeyResponse>('/auth/api-keys', payload);
}

/**
 * DELETE /auth/api-keys/:id
 * Permanently revokes an API key.
 */
export async function revokeApiKey(id: string): Promise<void> {
  return apiClient.delete<void>(`/auth/api-keys/${id}`);
}
