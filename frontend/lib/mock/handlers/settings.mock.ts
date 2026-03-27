/**
 * Mock handler — Settings API
 *
 * Provides in-memory implementations of the settings API endpoints.
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 */

import type { ApiKey, CreateApiKeyResult } from '@/lib/api/settings';
import type { User } from '@/lib/types/auth.types';

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const MOCK_API_KEYS: ApiKey[] = [
  {
    id: 'sk-001',
    name: 'Production Integration',
    keyPreview: 'kms_prod_••••••••••••••••',
    createdAt: '2025-02-10T09:00:00.000Z',
    lastUsedAt: '2025-03-20T14:30:00.000Z',
  },
  {
    id: 'sk-002',
    name: 'Local Dev Key',
    keyPreview: 'kms_dev_•••••••••••••••••',
    createdAt: '2025-01-05T11:00:00.000Z',
    lastUsedAt: null,
  },
];

/** In-memory list — mutations (create/revoke) are reflected immediately. */
let _apiKeys: ApiKey[] = [...MOCK_API_KEYS];

/** Mock profile — mirrors auth.store MOCK_ME shape */
let _profileName = 'Demo User';

/** Simulate realistic async delay. */
const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function mockListApiKeys(): Promise<ApiKey[]> {
  await delay(250);
  return [..._apiKeys];
}

export async function mockCreateApiKey(name: string): Promise<CreateApiKeyResult> {
  await delay(350);
  const id = `sk-${Date.now()}`;
  const newKey: ApiKey = {
    id,
    name,
    keyPreview: `kms_new_${'•'.repeat(16)}`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  _apiKeys = [..._apiKeys, newKey];
  return {
    key: `kms_new_mock_key_${id}_full_secret`,
    id,
  };
}

export async function mockRevokeApiKey(id: string): Promise<void> {
  await delay(250);
  _apiKeys = _apiKeys.filter((k) => k.id !== id);
}

export async function mockUpdateProfile(name: string): Promise<User> {
  await delay(300);
  _profileName = name;
  return {
    id: 'user-001',
    email: 'demo@kms.dev',
    name: _profileName,
    roles: ['user'],
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

/** Reset state — useful in tests. */
export function resetMockSettings(): void {
  _apiKeys = [...MOCK_API_KEYS];
  _profileName = 'Demo User';
}
