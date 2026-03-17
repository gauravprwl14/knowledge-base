'use client';

/**
 * useLogout — mutation hook that clears auth state and calls the backend.
 *
 * - Calls POST /auth/logout (invalidates the httpOnly refresh cookie)
 * - Clears the auth store regardless of server response
 * - Does NOT redirect — the caller handles navigation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logout as logoutApi } from '@/lib/api/auth.api';
import { logout as storeLogout } from '@/lib/stores/auth.store';

export interface UseLogoutReturn {
  logout: () => void;
  isPending: boolean;
}

export function useLogout(): UseLogoutReturn {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: logoutApi,
    onSettled: () => {
      // Always clear local state even if server call fails
      storeLogout();
      // Clear all cached queries — user data, files, sources, etc.
      queryClient.clear();
    },
  });

  return {
    logout: () => mutation.mutate(),
    isPending: mutation.isPending,
  };
}
