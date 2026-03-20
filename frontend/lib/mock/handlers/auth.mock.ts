/**
 * Mock handler — Auth API
 *
 * Matches the exact function signatures in lib/api/auth.api.ts.
 * Swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 * Revert: remove the flag (or set to false).
 */

import { MOCK_ME, MOCK_ACCESS_TOKEN, MOCK_API_KEYS, buildNewApiKey } from '../data/users.data';
import { login as storeLogin } from '@/lib/stores/auth.store';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@/lib/types/auth.types';

/** In-memory list — mutations (create/revoke) are reflected immediately. */
let _apiKeys = [...MOCK_API_KEYS];

/** Simulate realistic async delay. */
const delay = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms));

export async function mockLogin(_credentials: LoginRequest): Promise<AuthResponse> {
  await delay(400);
  // Seed the auth store so AuthProvider finds the user already set
  storeLogin(
    { id: MOCK_ME.id, email: MOCK_ME.email, name: MOCK_ME.name, roles: MOCK_ME.roles },
    MOCK_ACCESS_TOKEN,
  );
  // Set the kms-access-token cookie so the middleware route guard allows
  // access to protected routes (it only checks for the cookie, not the store)
  if (typeof document !== 'undefined') {
    document.cookie = `kms-access-token=${MOCK_ACCESS_TOKEN}; path=/; max-age=3600; SameSite=Lax`;
  }
  return { accessToken: MOCK_ACCESS_TOKEN, expiresIn: 900 };
}

export async function mockRegister(_payload: RegisterRequest): Promise<User> {
  await delay(500);
  return MOCK_ME as User;
}

export async function mockLogout(): Promise<void> {
  await delay(200);
  // Clear the mock session cookie
  if (typeof document !== 'undefined') {
    document.cookie = 'kms-access-token=; path=/; max-age=0';
  }
}

export async function mockGetMe(): Promise<User> {
  await delay(150);
  // Seed the auth store — AuthProvider calls this on mount
  storeLogin(
    { id: MOCK_ME.id, email: MOCK_ME.email, name: MOCK_ME.name, roles: MOCK_ME.roles },
    MOCK_ACCESS_TOKEN,
  );
  return MOCK_ME as User;
}

export async function mockListApiKeys(): Promise<ApiKey[]> {
  await delay(200);
  return [..._apiKeys];
}

export async function mockCreateApiKey(payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  await delay(300);
  const result = buildNewApiKey(payload.name, payload.expiresAt);
  _apiKeys = [..._apiKeys, result.apiKey];
  return result;
}

export async function mockRevokeApiKey(id: string): Promise<void> {
  await delay(250);
  _apiKeys = _apiKeys.filter((k) => k.id !== id);
}
