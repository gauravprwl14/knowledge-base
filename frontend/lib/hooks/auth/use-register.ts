'use client';

/**
 * useRegister — mutation hook for the registration flow.
 *
 * Backend sends a verification email after successful registration.
 * Does NOT auto-login — the caller should show "check your email" state.
 */

import { useMutation } from '@tanstack/react-query';
import { register as registerApi } from '@/lib/api/auth.api';
import type { RegisterRequest } from '@/lib/types/auth.types';

export interface UseRegisterReturn {
  mutate: (payload: RegisterRequest) => void;
  mutateAsync: (payload: RegisterRequest) => Promise<unknown>;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: string | null;
  reset: () => void;
}

export function useRegister(): UseRegisterReturn {
  const mutation = useMutation({
    mutationFn: registerApi,
  });

  const errorMessage = mutation.error
    ? (mutation.error as Error).message ?? 'Registration failed. Please try again.'
    : null;

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: errorMessage,
    reset: mutation.reset,
  };
}
