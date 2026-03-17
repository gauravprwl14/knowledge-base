'use client';

/**
 * AuthProvider — bootstraps the auth store on page load / refresh.
 *
 * Calls useMe() on mount which:
 * 1. Makes GET /auth/me using the httpOnly refresh cookie
 * 2. Populates the auth store with the user profile
 *
 * - Renders children immediately (no blocking loading state)
 * - Individual pages handle their own loading/auth-guard states
 * - Idempotent: if the user is already in the store, useMe() returns early
 *
 * Place this in the root locale layout, inside QueryProvider.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getMe } from '@/lib/api/auth.api';
import { login as storeLogin, useCurrentUser } from '@/lib/stores/auth.store';
import { apiClient } from '@/lib/api/client';
import { authStore } from '@/lib/stores/auth.store';
import { ME_QUERY_KEY } from '@/lib/hooks/auth/use-me';

// Wire token provider once at module level
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

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  useEffect(() => {
    // Skip if user is already hydrated in store (e.g. just logged in)
    if (currentUser) return;

    // Attempt to fetch the user profile — succeeds if there's a valid
    // refresh token cookie from a previous session
    const cached = queryClient.getQueryData(ME_QUERY_KEY);
    if (cached) return;

    getMe()
      .then((user) => {
        storeLogin(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles,
            avatarUrl: user.avatarUrl,
          },
          // Access token is managed by the client interceptor via cookie refresh
          authStore.state.accessToken ?? '',
        );
        queryClient.setQueryData(ME_QUERY_KEY, user);
      })
      .catch(() => {
        // Not authenticated — this is expected for unauthenticated pages
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always render children — don't block the page
  return <>{children}</>;
}
