/**
 * AuthProvider.test.tsx
 *
 * Unit tests for the AuthProvider component.
 * Covers: children rendering, getMe() call on mount, store hydration,
 * error silence, and skip when user already in store.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Auth store — mock to control user state and capture login calls
const mockUseCurrentUser = jest.fn<ReturnType<typeof import('@/lib/stores/auth.store').useCurrentUser>, []>();
const mockStoreLogin = jest.fn();
const mockStoreLogout = jest.fn();
const mockStoreSetAccessToken = jest.fn();

jest.mock('@/lib/stores/auth.store', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
  login: (...args: unknown[]) => mockStoreLogin(...args),
  logout: (...args: unknown[]) => mockStoreLogout(...args),
  setAccessToken: (...args: unknown[]) => mockStoreSetAccessToken(...args),
  setAuthRestorePromise: jest.fn(),
  getAuthRestorePromise: jest.fn(() => null),
  authStore: {
    state: { accessToken: null, user: null, isAuthenticated: false },
    setState: jest.fn(),
  },
}));

// auth.api — mock getMe to control resolution
const mockGetMe = jest.fn();
jest.mock('@/lib/api/auth.api', () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
}));

// api/client — mock to avoid side-effects from module-level setTokenProvider call
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    setTokenProvider: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
  },
}));

// @tanstack/react-query — stub useQueryClient
const mockGetQueryData = jest.fn();
const mockSetQueryData = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/components/features/auth/AuthProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeUser = () => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  roles: ['USER'] as string[],
  avatarUrl: undefined,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no user in store and no cached query data
    mockUseCurrentUser.mockReturnValue(null);
    mockGetQueryData.mockReturnValue(undefined);
    // Default: no refresh token in localStorage
    localStorage.clear();
  });

  // -------------------------------------------------------------------------
  // Children rendering
  // -------------------------------------------------------------------------

  describe('renders children', () => {
    it('always renders children regardless of auth state', () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetMe.mockResolvedValue(makeUser());

      // Act
      render(
        <AuthProvider>
          <div data-testid="child">Hello</div>
        </AuthProvider>,
      );

      // Assert
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('renders children when user is already in the store', () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(makeUser());

      // Act
      render(
        <AuthProvider>
          <span data-testid="content">Logged in</span>
        </AuthProvider>,
      );

      // Assert
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Session restore — skips when already hydrated
  // -------------------------------------------------------------------------

  describe('session restore', () => {
    it('skips fetch when user is already in the store', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(makeUser());

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      // Wait a tick for useEffect to fire
      await waitFor(() => expect(mockGetMe).not.toHaveBeenCalled());
    });

    it('skips fetch when ME_QUERY_KEY data is already cached', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(makeUser()); // cached

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      await waitFor(() => expect(mockGetMe).not.toHaveBeenCalled());
    });

    it('skips fetch when no refresh token is in localStorage', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(undefined);
      localStorage.removeItem('kms_refresh_token');

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      await waitFor(() => expect(mockGetMe).not.toHaveBeenCalled());
    });

    it('attempts session restore when refresh token exists in localStorage', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(undefined);
      localStorage.setItem('kms_refresh_token', 'refresh-jwt');

      // Mock global.fetch for the /auth/refresh call
      // Response matches the NestJS TransformInterceptor envelope shape:
      // { success: true, data: { accessToken, refreshToken, ... } }
      const successTokenResponse = {
        success: true,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => successTokenResponse,
      });

      mockGetMe.mockResolvedValue(makeUser());

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      // Assert — getMe() should be called after successful refresh
      await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
    });
  });

  // -------------------------------------------------------------------------
  // getMe() success path
  // -------------------------------------------------------------------------

  describe('getMe() success', () => {
    it('calls storeLogin with the fetched user after successful refresh', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(undefined);
      localStorage.setItem('kms_refresh_token', 'stored-refresh');

      const user = makeUser();
      // TransformInterceptor-wrapped response (production shape)
      const successTokenResponse = {
        success: true,
        data: {
          accessToken: 'access-abc',
          refreshToken: 'refresh-xyz',
          expiresIn: 3600,
          tokenType: 'Bearer',
        },
        timestamp: '2026-01-01T00:00:00.000Z',
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => successTokenResponse,
      });
      mockGetMe.mockResolvedValue(user);

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      // Assert — storeLogin must be called with the unwrapped token, not undefined
      await waitFor(() => {
        expect(mockStoreLogin).toHaveBeenCalledWith(
          expect.objectContaining({ email: user.email }),
          'access-abc',
        );
      });
    });
  });

  // -------------------------------------------------------------------------
  // getMe() failure path
  // -------------------------------------------------------------------------

  describe('getMe() failure', () => {
    it('renders children silently when refresh fails (no error thrown)', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(undefined);
      localStorage.setItem('kms_refresh_token', 'bad-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      });

      // Act & Assert — no error should be thrown
      expect(() =>
        render(
          <AuthProvider>
            <div data-testid="child-error">still here</div>
          </AuthProvider>,
        ),
      ).not.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('child-error')).toBeInTheDocument();
      });
    });

    it('does not call storeLogin when session restore fails', async () => {
      // Arrange
      mockUseCurrentUser.mockReturnValue(null);
      mockGetQueryData.mockReturnValue(undefined);
      localStorage.setItem('kms_refresh_token', 'bad-token');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({}),
      });

      // Act
      render(
        <AuthProvider>
          <div />
        </AuthProvider>,
      );

      // Wait briefly, then assert storeLogin was never called
      await new Promise((r) => setTimeout(r, 50));
      expect(mockStoreLogin).not.toHaveBeenCalled();
    });
  });
});
