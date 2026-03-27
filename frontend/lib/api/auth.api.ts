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

// Shape returned by the real /auth/login endpoint
interface LoginApiResponse {
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  };
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
}

/** POST /auth/login */
export async function login(credentials: LoginRequest): Promise<AuthResponse> {
  if (USE_MOCK) return mockAuth.mockLogin(credentials);
  const res = await apiClient.post<LoginApiResponse>('/auth/login', credentials);
  return {
    accessToken: res.tokens.accessToken,
    refreshToken: res.tokens.refreshToken,
    expiresIn: res.tokens.expiresIn,
  };
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

// Shape returned by the real /users/me endpoint
interface MeApiResponse {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

/** GET /users/me — returns the authenticated user's profile. */
export async function getMe(): Promise<User> {
  if (USE_MOCK) return mockAuth.mockGetMe();
  const res = await apiClient.get<MeApiResponse>('/users/me');
  return {
    id: res.id,
    email: res.email,
    name: [res.firstName, res.lastName].filter(Boolean).join(' ') || res.email,
    roles: [res.role],
  };
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
