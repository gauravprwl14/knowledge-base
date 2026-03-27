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
import { login as storeLogin, logout as storeLogout, useCurrentUser, authStore, setAccessToken as storeSetAccessToken, setAuthRestorePromise, getAuthRestorePromise } from '@/lib/stores/auth.store';
import { apiClient } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/auth/use-me';

const REFRESH_TOKEN_KEY = 'kms_refresh_token';

function buildSessionCookieClear(): string {
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureAttr = isHttps ? '; Secure' : '';
  return `kms-access-token=; path=/; SameSite=Lax${secureAttr}; max-age=0`;
}

// Wire token provider once at module level
apiClient.setTokenProvider({
  getAccessToken: () => authStore.state.accessToken,
  setAccessToken: (token) => {
    storeSetAccessToken(token);
  },
  onAuthFailure: () => {
    // Use logout() so the session cookie is cleared alongside the store state.
    // If we only clear the in-memory store, middleware keeps seeing the stale
    // cookie and lets the user through, but API calls continue to fail.
    storeLogout();
  },
  // Expose the in-flight restore promise so the request interceptor can await
  // it before attaching the Bearer token (eliminates the JTI replay race).
  getAuthRestorePromise: () => getAuthRestorePromise(),
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

        const json = await res.json();
        // Unwrap the NestJS TransformInterceptor envelope:
        //   { success: true, data: { accessToken, refreshToken, ... } }
        // Falls back to root-level fields for any non-wrapped response.
        const data = (
          json?.success === true && json?.data ? json.data : json
        ) as {
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
          tokenType: string;
        };

        const { accessToken, refreshToken: newRefreshToken } = data;

        // Use storeSetAccessToken so the session cookie is updated immediately.
        // If we only update the store, the cookie still has the old token and
        // the middleware may reject the next navigation before getMe() returns.
        storeSetAccessToken(accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);

        // Clear the restore promise BEFORE calling getMe().
        // getMe() uses apiClient which awaits _authRestorePromise in its
        // request interceptor. If we don't clear it here first, getMe()
        // deadlocks: it awaits _authRestorePromise, which only resolves when
        // restoreSession() completes, which is waiting for getMe(). Clearing
        // the promise here lets getMe() proceed immediately with the access
        // token we just stored above.
        setAuthRestorePromise(null);

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
            document.cookie = buildSessionCookieClear();
          }
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          }
        }
      }
    };

    // Register the promise so request interceptor can await it.
    // Any API call that fires while session restore is in flight will wait
    // until restoreSession() resolves before attaching the Bearer token.
    const p = restoreSession().finally(() => setAuthRestorePromise(null));
    setAuthRestorePromise(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
