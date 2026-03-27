'use client';

/**
 * Google OAuth Callback Page
 *
 * Auth strategy overview
 * ──────────────────────
 * The backend redirects here after a successful Google OAuth exchange:
 *   GET /kms/en/auth/callback?accessToken=<jwt>&refreshToken=<jwt>
 *
 * Responsibilities:
 * 1. Read accessToken + refreshToken from the URL query string.
 * 2. Immediately set the access token in the auth store AND write the
 *    `kms-access-token` session cookie that the Next.js middleware uses to
 *    determine whether a route is protected.
 * 3. Persist the refresh token to localStorage for silent refresh.
 * 4. Fetch the full user profile via GET /users/me.
 * 5. Redirect to dashboard (or the original destination if ?next= was set).
 *
 * IMPORTANT — token provider
 * ──────────────────────────
 * Do NOT register `apiClient.setTokenProvider()` here.  AuthProvider (in the
 * root layout) has already registered the correct provider that updates both
 * the in-memory store AND the session cookie on every token write.  Calling
 * setTokenProvider() here would overwrite that with a version that skips the
 * cookie, breaking silent refresh and logout for the rest of the session.
 *
 * IMPORTANT — Suspense
 * ─────────────────────
 * useSearchParams() must be called inside a <Suspense> boundary in Next.js 14.
 * Without it, searchParams is null during static rendering, causing the page to
 * redirect to /login?error=oauth_failed before any tokens are set.
 * The outer `OAuthCallbackPage` wrapper provides the required Suspense boundary
 * while `OAuthCallbackContent` does the actual work.
 */

import { Suspense, useEffect } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { login as storeLogin, setAccessToken as storeSetAccessToken } from '@/lib/stores/auth.store';
import { getMe } from '@/lib/api/auth.api';

const REFRESH_TOKEN_KEY = 'kms_refresh_token';

// ---------------------------------------------------------------------------
// Inner component — requires Suspense parent
// ---------------------------------------------------------------------------

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  useEffect(() => {
    const accessToken = searchParams?.get('accessToken');
    const refreshToken = searchParams?.get('refreshToken');
    // ?next= is forwarded from the middleware's original destination param.
    // The backend preserves it when building the callback redirect URL.
    const next = searchParams?.get('next');

    if (!accessToken) {
      // No token in URL — something went wrong during the OAuth exchange.
      router.replace(`/${locale}/login?error=oauth_failed` as Parameters<typeof router.replace>[0]);
      return;
    }

    // 1. Write the access token into the auth store AND the session cookie.
    //    storeLogin() calls setSessionCookie() internally, which is what the
    //    Next.js middleware reads to decide if a route is accessible.
    //    We use an empty-shell user here; the real profile is fetched below.
    storeLogin({ id: '', email: '', name: '', roles: [] }, accessToken);

    // 2. Persist the refresh token for silent refresh on future page loads.
    if (refreshToken && typeof localStorage !== 'undefined') {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }

    // 3. Fetch the full user profile and redirect.
    getMe()
      .then((user) => {
        // Overwrite the empty-shell user with the real profile.
        // storeLogin() writes the cookie again here, which is intentional —
        // it guarantees the cookie reflects the same token the API auth header uses.
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
        const destination = (next ?? '/dashboard') as Parameters<typeof router.replace>[0];
        // Call router.refresh() FIRST to clear the Next.js Router Cache.
        // Without this, the Router Cache may contain stale redirect-to-login responses
        // from prefetches that happened before the auth cookie was set. These stale
        // entries survive even after login, causing sidebar clicks to redirect to login.
        // router.refresh() is the documented way to invalidate the full Router Cache in
        // Next.js 14 (https://nextjs.org/docs/app/building-your-application/caching).
        router.refresh();
        router.replace(destination);
      })
      .catch(() => {
        // getMe() failed — token may be valid but profile fetch failed.
        // Still navigate to dashboard; the user can retry later.
        // storeLogin with the empty shell remains in effect.
        //
        // Use storeSetAccessToken to ensure the cookie stays consistent even
        // though we didn't re-call storeLogin with a real user.
        storeSetAccessToken(accessToken);
        const destination = (next ?? '/dashboard') as Parameters<typeof router.replace>[0];
        // Call router.refresh() FIRST to clear the Next.js Router Cache.
        // Without this, the Router Cache may contain stale redirect-to-login responses
        // from prefetches that happened before the auth cookie was set. These stale
        // entries survive even after login, causing sidebar clicks to redirect to login.
        // router.refresh() is the documented way to invalidate the full Router Cache in
        // Next.js 14 (https://nextjs.org/docs/app/building-your-application/caching).
        router.refresh();
        router.replace(destination);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-500">Signing you in…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — provides required Suspense boundary for useSearchParams
// ---------------------------------------------------------------------------

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">Signing you in…</p>
        </div>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  );
}
