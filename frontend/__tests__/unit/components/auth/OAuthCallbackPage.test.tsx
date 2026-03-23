/**
 * OAuthCallbackPage.test.tsx
 *
 * Unit tests for the Google OAuth callback page.
 *
 * Tests cover the critical session-establishment flow:
 * - Token extraction from URL params
 * - Cookie / auth-store hydration via storeLogin()
 * - Refresh token persistence to localStorage
 * - getMe() success and failure paths
 * - Redirect to dashboard (or ?next= destination)
 * - NO module-level setTokenProvider call (regression guard)
 *
 * Auth strategy reminder
 * ──────────────────────
 * After Google OAuth the backend redirects to:
 *   /en/auth/callback?accessToken=<jwt>&refreshToken=<jwt>
 *
 * The callback page must:
 * 1. Call storeLogin() immediately — this writes `kms-access-token` cookie
 *    that the Next.js middleware checks on every protected-route request.
 * 2. Persist refreshToken to localStorage ('kms_refresh_token').
 * 3. Fetch full user profile via getMe().
 * 4. Navigate to /dashboard (or ?next= URL).
 *
 * If step 1 is skipped or the token provider is overwritten incorrectly,
 * the cookie won't be set and subsequent sidebar navigations redirect to login.
 */

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

const mockStoreLogin = jest.fn();
const mockStoreSetAccessToken = jest.fn();
const mockRouterReplace = jest.fn();
const mockRouterRefresh = jest.fn();

jest.mock('@/lib/stores/auth.store', () => ({
  login: (...args: unknown[]) => mockStoreLogin(...args),
  setAccessToken: (...args: unknown[]) => mockStoreSetAccessToken(...args),
  authStore: {
    state: { accessToken: null, user: null, isAuthenticated: false },
    setState: jest.fn(),
  },
  logout: jest.fn(),
}));

const mockGetMe = jest.fn();
jest.mock('@/lib/api/auth.api', () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

// next/navigation — stub useSearchParams, useParams
const mockSearchParamsGet = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
  useParams: () => ({ locale: 'en' }),
}));

// @/i18n/routing — stub useRouter (next-intl's locale-aware router)
jest.mock('@/i18n/routing', () => ({
  useRouter: () => ({ replace: mockRouterReplace, refresh: mockRouterRefresh }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) =>
    // eslint-disable-next-line react/react-in-jsx-scope
    <a href={href}>{children}</a>,
  usePathname: () => '/',
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
// Import the default export (the Suspense wrapper)
import OAuthCallbackPage from '@/app/[locale]/(auth)/auth/callback/page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_KEY = 'kms_refresh_token';

const makeUser = () => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['USER'],
  avatarUrl: undefined,
});

function setupSearchParams({
  accessToken = 'access-jwt',
  refreshToken = 'refresh-jwt',
  next = null,
}: {
  accessToken?: string | null;
  refreshToken?: string | null;
  next?: string | null;
}) {
  mockSearchParamsGet.mockImplementation((key: string) => {
    if (key === 'accessToken') return accessToken;
    if (key === 'refreshToken') return refreshToken;
    if (key === 'next') return next;
    return null;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetMe.mockResolvedValue(makeUser());
  });

  // -------------------------------------------------------------------------
  // Session cookie establishment (the central regression guard)
  // -------------------------------------------------------------------------

  describe('auth store + cookie hydration', () => {
    it('calls storeLogin() immediately with the access token from the URL', async () => {
      setupSearchParams({ accessToken: 'test-access-token' });

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      // storeLogin is called at least once (before getMe) with the access token
      expect(mockStoreLogin).toHaveBeenCalledWith(
        expect.objectContaining({ id: '', email: '', name: '' }),
        'test-access-token',
      );
    });

    it('calls storeLogin() a second time with the real user profile after getMe()', async () => {
      const user = makeUser();
      setupSearchParams({ accessToken: 'test-access-token' });
      mockGetMe.mockResolvedValue(user);

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockStoreLogin).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'user-1', email: 'test@example.com' }),
          'test-access-token',
        ),
      );
    });

    it('does NOT register a token provider (must not overwrite AuthProvider\'s)', () => {
      // The module-level code of the callback page must not call
      // apiClient.setTokenProvider().  That registration belongs exclusively
      // to AuthProvider (root layout) where it correctly updates the cookie.
      // If the callback page registers its own provider the cookie stops being
      // updated on silent refresh, breaking sidebar navigations for the
      // remainder of the session.
      //
      // We verify this by asserting the apiClient mock was never called.
      setupSearchParams({ accessToken: 'test-access-token' });

      // Re-require the module to capture module-level side-effects
      jest.isolateModules(() => {
        const mockSetTokenProvider = jest.fn();
        jest.doMock('@/lib/api/client', () => ({
          apiClient: { setTokenProvider: mockSetTokenProvider, get: jest.fn(), post: jest.fn() },
        }));

        // Loading the module should NOT call setTokenProvider
        require('@/app/[locale]/(auth)/auth/callback/page');
        expect(mockSetTokenProvider).not.toHaveBeenCalled();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Refresh token persistence
  // -------------------------------------------------------------------------

  describe('refresh token persistence', () => {
    it('saves the refresh token to localStorage', async () => {
      setupSearchParams({ accessToken: 'access-jwt', refreshToken: 'refresh-jwt' });

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('refresh-jwt'),
      );
    });

    it('does not crash when refresh token is absent', async () => {
      setupSearchParams({ accessToken: 'access-jwt', refreshToken: null });

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      // Should not throw, localStorage should remain empty
      expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Redirect after successful login
  // -------------------------------------------------------------------------

  describe('redirect behaviour', () => {
    it('redirects to /dashboard after successful getMe()', async () => {
      setupSearchParams({ accessToken: 'access-jwt' });
      mockGetMe.mockResolvedValue(makeUser());

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard'),
      );
    });

    it('honours the ?next= param and redirects to the original destination', async () => {
      setupSearchParams({ accessToken: 'access-jwt', next: '/files' });
      mockGetMe.mockResolvedValue(makeUser());

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/files'),
      );
    });

    it('still redirects to /dashboard when getMe() fails', async () => {
      setupSearchParams({ accessToken: 'access-jwt' });
      mockGetMe.mockRejectedValue(new Error('network error'));

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard'),
      );
    });

    it('calls storeSetAccessToken() when getMe() fails (keeps cookie fresh)', async () => {
      setupSearchParams({ accessToken: 'access-jwt' });
      mockGetMe.mockRejectedValue(new Error('network error'));

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockStoreSetAccessToken).toHaveBeenCalledWith('access-jwt'),
      );
    });

    it('redirects to /login?error=oauth_failed when accessToken is absent', async () => {
      setupSearchParams({ accessToken: null });

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() =>
        expect(mockRouterReplace).toHaveBeenCalledWith(
          expect.stringContaining('/login?error=oauth_failed'),
        ),
      );
    });

    it('does NOT call storeLogin when accessToken is absent', async () => {
      setupSearchParams({ accessToken: null });

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
      expect(mockStoreLogin).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getMe() error does not prevent cookie hydration
  // -------------------------------------------------------------------------

  describe('resilience when getMe() fails', () => {
    it('still calls storeLogin() (sets cookie) even when getMe() rejects', async () => {
      setupSearchParams({ accessToken: 'access-jwt' });
      mockGetMe.mockRejectedValue(new Error('server error'));

      await act(async () => {
        render(<OAuthCallbackPage />);
      });

      // storeLogin was called before getMe() — cookie is set regardless
      expect(mockStoreLogin).toHaveBeenCalledWith(
        expect.objectContaining({ id: '' }),
        'access-jwt',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders a "signing you in" message while getMe is pending', () => {
      setupSearchParams({ accessToken: 'access-jwt' });
      // Keep getMe pending so we can inspect the loading state
      mockGetMe.mockReturnValue(new Promise(() => {}));

      const { getByText } = render(<OAuthCallbackPage />);
      expect(getByText(/signing you in/i)).toBeInTheDocument();
    });
  });
});
