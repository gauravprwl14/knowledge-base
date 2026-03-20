/**
 * Auth API — typed wrappers over the KMS auth endpoints.
 *
 * Mock swap: set NEXT_PUBLIC_USE_MOCK=true in .env.local.
 * Each function checks the flag and delegates to the mock handler.
 * To use real API: remove the flag (or set to false). No other changes needed.
 */

import { apiClient } from './client';
import * as mockAuth from '@/lib/mock/handlers/auth.mock';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from '@/lib/types/auth.types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

/** POST /auth/login */
export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCK) return mockAuth.mockLogin(credentials);
  return apiClient.post<AuthResponse>('/auth/login', credentials);
}

/** POST /auth/register */
export async function register(payload: RegisterRequest): Promise<User> {
  if (USE_MOCK) return mockAuth.mockRegister(payload);
  return apiClient.post<User>('/auth/register', {
    email: payload.email,
    password: payload.password,
    name: payload.name,
  });
}

/** POST /auth/logout */
export async function logout(): Promise<void> {
  if (USE_MOCK) return mockAuth.mockLogout();
  return apiClient.post<void>('/auth/logout');
}

/** GET /auth/me — also seeds the auth store in mock mode. */
export async function getMe(): Promise<User> {
  if (USE_MOCK) return mockAuth.mockGetMe();
  return apiClient.get<User>('/auth/me');
}

/** GET /auth/api-keys */
export async function listApiKeys(): Promise<ApiKey[]> {
  if (USE_MOCK) return mockAuth.mockListApiKeys();
  return apiClient.get<ApiKey[]>('/auth/api-keys');
}

/** POST /auth/api-keys */
export async function createApiKey(payload: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
  if (USE_MOCK) return mockAuth.mockCreateApiKey(payload);
  return apiClient.post<CreateApiKeyResponse>('/auth/api-keys', payload);
}

/** DELETE /auth/api-keys/:id */
export async function revokeApiKey(id: string): Promise<void> {
  if (USE_MOCK) return mockAuth.mockRevokeApiKey(id);
  return apiClient.delete<void>(`/auth/api-keys/${id}`);
}
