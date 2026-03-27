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
import type { LoginRequest, AuthResponse } from '@/lib/types/auth.types';
// Note: token provider is registered by AuthProvider at module level — no duplicate needed here.

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
