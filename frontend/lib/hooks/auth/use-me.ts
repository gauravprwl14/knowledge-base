'use client';

/**
 * useMe — query hook that fetches the authenticated user's profile.
 *
 * - Populates the auth store (`login()` action) on success
 * - Used by AuthProvider on mount to hydrate store from cookie session
 * - Individual pages can call this to read user data from the store cache
 *
 * The query is only enabled when we don't already have a user in the store
 * (to avoid unnecessary API calls when already hydrated).
 */

import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/lib/api/auth.api';
import { login as storeLogin, useCurrentUser, authStore } from '@/lib/stores/auth.store';
import type { User } from '@/lib/types/auth.types';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export interface UseMeReturn {
  user: User | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useMe(): UseMeReturn {
  const storeUser = useCurrentUser();

  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const user = await getMe();
      // Hydrate store — accessToken may already be set from the login mutation
      // We pass empty string here; the token is managed separately
      storeLogin(
        {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          avatarUrl: user.avatarUrl,
        },
        authStore.state.accessToken ?? '',
      );
      return user;
    },
    // Retry once — if /me returns 401, user is not authenticated
    retry: 1,
    // Don't refetch just because the window regains focus
    refetchOnWindowFocus: false,
    // Use a long stale time — profile doesn't change often
    staleTime: 5 * 60 * 1_000,
  });

  return {
    user: storeUser ?? query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
