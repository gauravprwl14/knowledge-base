'use client';

/**
 * AuthProvider — bootstraps the auth store on page load / refresh.
 *
 * On mount:
 * 1. If user already in store — skip (just logged in)
 * 2. Try to restore session using refresh token from localStorage
 * 3. If refresh succeeds, store new access token and fetch user profile
 * 4. If refresh fails, clear session cookie and localStorage
 *
 * Place this in the root locale layout, inside QueryProvider.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getMe } from '@/lib/api/auth.api';
import { login as storeLogin, useCurrentUser, authStore } from '@/lib/stores/auth.store';
import { apiClient } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/auth/use-me';

const REFRESH_TOKEN_KEY = 'kms_refresh_token';
const SESSION_COOKIE_CLEAR = 'kms-access-token=; path=/; SameSite=Lax; Secure; max-age=0';

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
    if (currentUser) return;

    const cached = queryClient.getQueryData(ME_QUERY_KEY);
    if (cached) return;

    const refreshToken =
      typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;

    if (!refreshToken) return;

    const restoreSession = async () => {
      try {
        const res = await fetch('/kms/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) {
          throw new Error('refresh failed');
        }

        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
          tokenType: string;
        };

        const { accessToken, refreshToken: newRefreshToken } = data;

        authStore.setState((prev) => ({ ...prev, accessToken }));
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);

        const user = await getMe();
        storeLogin(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            roles: user.roles,
            avatarUrl: user.avatarUrl,
          },
          accessToken,
        );
        queryClient.setQueryData(ME_QUERY_KEY, user);
      } catch {
        // Only wipe the session if client.ts didn't already recover via its own
        // refresh-and-retry path. Both AuthProvider and the 401 interceptor in
        // client.ts race to refresh the token on page load; whichever wins
        // stores a valid access token in the auth store. If we lost the race we
        // must NOT clear the cookie that the winner just set.
        const alreadyRecovered = !!authStore.state.accessToken;
        if (!alreadyRecovered) {
          if (typeof document !== 'undefined') {
            document.cookie = SESSION_COOKIE_CLEAR;
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          }
        }
      }
    };

    restoreSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
