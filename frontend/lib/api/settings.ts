/**
 * Settings API — profile and API key management.
 *
 * Mock swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 * Each function checks the flag and delegates to the mock handler.
 */

import { apiClient } from './client';
import * as mockSettings from '@/lib/mock/handlers/settings.mock';
import type { User } from '@/lib/types/auth.types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single API key as listed in the settings view. */
export interface ApiKey {
  id: string;
  name: string;
  /** Masked preview, e.g. "kms_prod_•••••" */
  keyPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Response after generating a new API key — full key shown once only. */
export interface CreateApiKeyResult {
  /** Full key value — display once, never stored. */
  key: string;
  id: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

/** GET /users/me/api-keys — list all API keys for the current user. */
export async function listApiKeys(): Promise<ApiKey[]> {
  if (USE_MOCK) return mockSettings.mockListApiKeys();
  return apiClient.get<ApiKey[]>('/users/me/api-keys');
}

/** POST /users/me/api-keys — generate a new named API key. */
export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  if (USE_MOCK) return mockSettings.mockCreateApiKey(name);
  return apiClient.post<CreateApiKeyResult>('/users/me/api-keys', { name });
}

/** DELETE /users/me/api-keys/:id — revoke an API key. */
export async function revokeApiKey(id: string): Promise<void> {
  if (USE_MOCK) return mockSettings.mockRevokeApiKey(id);
  return apiClient.delete<void>(`/users/me/api-keys/${id}`);
}

/** PATCH /users/me — update the current user's display name. */
export async function updateProfile(name: string): Promise<User> {
  if (USE_MOCK) return mockSettings.mockUpdateProfile(name);
  return apiClient.patch<User>('/users/me', { name });
}

// ---------------------------------------------------------------------------
// Namespace export — matches the pattern used across the codebase
// ---------------------------------------------------------------------------

export const settingsApi = {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  updateProfile,
};
