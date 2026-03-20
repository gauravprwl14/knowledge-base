/**
 * Mock data — Users & Auth
 *
 * Single demo user. All other mock data is scoped to this userId.
 * Replace with real API calls by removing NEXT_PUBLIC_USE_MOCK=true.
 */

import type { AuthUser } from '@/lib/stores/auth.store';
import type { ApiKey, CreateApiKeyResponse } from '@/lib/types/auth.types';

export const MOCK_USER: AuthUser = {
  id: 'user-001',
  email: 'demo@kms.dev',
  name: 'Demo User',
  roles: ['user'],
  avatarUrl: undefined,
};

/** Full User shape (as returned by GET /auth/me) */
export const MOCK_ME = {
  id: 'user-001',
  email: 'demo@kms.dev',
  name: 'Demo User',
  roles: ['user'] as string[],
  avatarUrl: undefined as string | undefined,
  createdAt: '2025-01-01T00:00:00.000Z',
};

export const MOCK_ACCESS_TOKEN = 'mock-access-token-demo';

export const MOCK_API_KEYS: ApiKey[] = [
  {
    id: 'apikey-001',
    name: 'Production Key',
    prefix: 'kms_prod_',
    createdAt: '2025-02-15T10:00:00.000Z',
    expiresAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2025-03-18T14:22:00.000Z',
  },
  {
    id: 'apikey-002',
    name: 'Dev / Local Key',
    prefix: 'kms_dev_',
    createdAt: '2025-01-10T09:00:00.000Z',
    expiresAt: null,
    lastUsedAt: '2025-03-20T08:05:00.000Z',
  },
];

/** Generates a mock CreateApiKeyResponse. Called by mockCreateApiKey. */
export function buildNewApiKey(name: string, expiresAt?: string | null): CreateApiKeyResponse {
  const id = `apikey-${Date.now()}`;
  const apiKey: ApiKey = {
    id,
    name,
    prefix: 'kms_new_',
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt ?? null,
    lastUsedAt: null,
  };
  return {
    key: `kms_new_mock_key_${id}`,
    apiKey,
  };
}
