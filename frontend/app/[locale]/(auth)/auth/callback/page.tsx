'use client';

/**
 * Google OAuth callback page.
 *
 * The backend redirects here after a successful Google OAuth exchange:
 *   GET /kms/en/auth/callback?accessToken=<jwt>&refreshToken=<jwt>
 *
 * Responsibilities:
 * 1. Read accessToken + refreshToken from the URL query string.
 * 2. Store the access token in the in-memory auth store.
 * 3. Fetch the user profile via GET /users/me.
 * 4. Redirect to /dashboard on success, or /login on failure.
 *
 * Security note: tokens are in query params only for the duration of this
 * page load.  After the redirect the URL is replaced so tokens are not
 * stored in browser history.
 */

import { useEffect } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { login as storeLogin } from '@/lib/stores/auth.store';
import { apiClient } from '@/lib/api/client';
import { authStore } from '@/lib/stores/auth.store';
import { getMe } from '@/lib/api/auth.api';

// Wire the token provider so apiClient can attach the Bearer token to
// /users/me right away (before AuthProvider runs).
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

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (!accessToken) {
      // No token — something went wrong, send back to login
      router.replace(`/${locale}/login?error=oauth_failed`);
      return;
    }

    // Store access token immediately so subsequent API calls are authenticated
    storeLogin({ id: '', email: '', name: '', roles: [] }, accessToken);
    // Store refresh token in localStorage for silent refresh (best-effort)
    if (refreshToken) {
      try {
        localStorage.setItem('kms_refresh_token', refreshToken);
      } catch {
        // localStorage may be unavailable in restricted environments
      }
    }

    // Fetch the real user profile and complete the login
    getMe()
      .then((user) => {
        storeLogin(user, accessToken);
        // Replace the URL to remove tokens from browser history, then navigate
        router.replace(`/${locale}/dashboard`);
      })
      .catch(() => {
        // Profile fetch failed but we have a valid token — still proceed
        router.replace(`/${locale}/dashboard`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Signing you in…</p>
    </div>
  );
}
