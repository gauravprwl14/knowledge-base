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
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LoginForm } from './LoginForm';
import { useLogin } from '@/lib/hooks/auth/use-login';
import { login as storeLogin } from '@/lib/stores/auth.store';
import { getMe } from '@/lib/api/auth.api';
import { ME_QUERY_KEY } from '@/lib/hooks/auth/use-me';
import type { LoginRequest } from '@/lib/types/auth.types';

const GOOGLE_OAUTH_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000';

export function LoginFeature() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, error, reset } = useLogin();

  const handleSubmit = useCallback(
    async (data: LoginRequest) => {
      try {
        reset();
        const authResponse = await mutateAsync(data);

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

        // 3. Navigate to dashboard
        router.push(`/${locale}/dashboard`);
        router.refresh();
      } catch {
        // Error is already surfaced via the `error` field from useLogin
      }
    },
    [mutateAsync, reset, router, locale, queryClient],
  );

  const handleGoogleLogin = useCallback(() => {
    // Redirect to backend Google OAuth initiation endpoint
    window.location.href = `${GOOGLE_OAUTH_URL}/api/v1/auth/google`;
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
