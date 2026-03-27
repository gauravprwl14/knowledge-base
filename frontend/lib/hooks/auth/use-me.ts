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
import { login as storeLogin, useCurrentUser, useAccessToken, authStore } from '@/lib/stores/auth.store';
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
  // Reactive: re-evaluates when the token appears (e.g. after AuthProvider
  // restores the session). Prevents useMe from racing AuthProvider's refresh
  // on page load — without a token the query would trigger client.ts's own
  // refresh, causing two concurrent refresh requests with the same token.
  const accessToken = useAccessToken();

  const query = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const user = await getMe();
      const currentToken = authStore.state.accessToken;
      // Only hydrate the store (and update the session cookie) when we
      // actually have a token — avoids setSessionCookie('') which would
      // write an empty cookie value and fool the middleware into rejecting
      // subsequent navigations.
      if (currentToken) {
        storeLogin(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles,
            avatarUrl: user.avatarUrl,
          },
          currentToken,
        );
      }
      return user;
    },
    // Only run once we have an access token in the store.  This prevents
    // useMe from triggering client.ts's 401→refresh path before AuthProvider
    // has had a chance to restore the session on page load.
    enabled: !!accessToken,
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
