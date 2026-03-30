'use client';

/**
 * LoginFeature — wires useLogin hook to the LoginForm UI.
 *
 * Responsibilities:
 * - Calls useLogin() mutation
 * - On success: stores token → fetches user profile → redirects to dashboard
 * - On error: passes error message to LoginForm
 * - Handles Google OAuth redirect (placeholder — wires to backend OAuth flow)
 */

import { useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useQueryClient } from '@tanstack/react-query';
import { LoginForm } from './LoginForm';
import { useLogin } from '@/lib/hooks/auth/use-login';
import { login as storeLogin } from '@/lib/stores/auth.store';
import { getMe } from '@/lib/api/auth.api';
import { getApiBaseUrl } from '@/lib/api/client';
import { ME_QUERY_KEY } from '@/lib/hooks/auth/use-me';
import type { LoginRequest } from '@/lib/types/auth.types';

const REFRESH_TOKEN_KEY = 'kms_refresh_token';

export function LoginFeature() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) ?? 'en';
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, error, reset } = useLogin();

  const handleSubmit = useCallback(
    async (data: LoginRequest) => {
      try {
        reset();
        const authResponse = await mutateAsync(data);

        // Persist refresh token for session restoration on page reload
        if (authResponse.refreshToken && typeof localStorage !== 'undefined') {
          localStorage.setItem(REFRESH_TOKEN_KEY, authResponse.refreshToken);
        }

        // 1. Store the access token in the auth store
        //    getMe() needs the token set first — storeLogin does this via the
        //    token provider that use-login.ts wires up
        storeLogin(
          { id: '', email: data.email, name: '', roles: [] },
          authResponse.accessToken,
        );

        // 2. Fetch the real user profile
        try {
          const user = await getMe();
          storeLogin(
            {
              id: user.id,
              email: user.email,
              name: user.name,
              roles: user.roles,
              avatarUrl: user.avatarUrl,
            },
            authResponse.accessToken,
          );
          // Seed the query cache so useMe() hooks resolve immediately
          queryClient.setQueryData(ME_QUERY_KEY, user);
        } catch {
          // getMe failed — still proceed, user store has partial data
        }

        // 3. Navigate to the intended destination (or dashboard as fallback).
        //    Middleware sets ?next= when redirecting unauthenticated users,
        //    so honouring it returns the user to where they were going.
        const next = searchParams?.get('next');
        // Invalidate Router Cache before navigating so sidebar prefetches
        // are refetched with the new auth cookie.
        router.refresh();
        router.push(next ?? `/${locale}/dashboard`);
      } catch {
        // Error is already surfaced via the `error` field from useLogin
      }
    },
    [mutateAsync, reset, router, locale, queryClient, searchParams],
  );

  const handleGoogleLogin = useCallback(() => {
    // Redirect to backend Google OAuth initiation endpoint.
    // getApiBaseUrl() resolves BASE_URL + /api/v1, correctly handling
    // both the /kms basePath in production and localhost in development.
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  }, []);

  return (
    <LoginForm
      onSubmit={handleSubmit}
      isLoading={isPending}
      error={error}
      onGoogleLogin={handleGoogleLogin}
      registerHref={`/${locale}/register`}
      forgotPasswordHref={`/${locale}/forgot-password`}
    />
  );
}
