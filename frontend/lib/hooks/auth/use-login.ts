'use client';

/**
 * useLogin — mutation hook for the login flow.
 *
 * On success:
 * 1. Stores access token via auth store action `login()`
 * 2. Injects the token into the API client's token provider
 * 3. Returns the AuthResponse for the caller to redirect
 *
 * On error:
 * Surfaces a human-readable message from the ApiError.
 */

import { useMutation } from '@tanstack/react-query';
import { login as loginApi } from '@/lib/api/auth.api';
import { login as storeLogin, authStore } from '@/lib/stores/auth.store';
import { apiClient } from '@/lib/api/client';
import type { LoginRequest, AuthResponse } from '@/lib/types/auth.types';

// Wire up the API client token provider once — idempotent
apiClient.setTokenProvider({
  getAccessToken: () => authStore.state.accessToken,
  setAccessToken: (token) => {
    authStore.setState((prev) => ({ ...prev, accessToken: token }));
  },
  onAuthFailure: () => {
    authStore.setState(() => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    }));
  },
});

export interface UseLoginReturn {
  mutate: (credentials: LoginRequest) => void;
  mutateAsync: (credentials: LoginRequest) => Promise<AuthResponse>;
  isPending: boolean;
  isError: boolean;
  error: string | null;
  reset: () => void;
}

export function useLogin(): UseLoginReturn {
  const mutation = useMutation({
    mutationFn: loginApi,
  });

  const errorMessage = mutation.error
    ? (mutation.error as Error).message ?? 'Login failed. Please try again.'
    : null;

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: errorMessage,
    reset: mutation.reset,
  };
}
