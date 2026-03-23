'use client';

/**
 * Auth Store — TanStack Store
 *
 * Manages: authenticated user, in-memory JWT access token, login/logout.
 * Token is kept in-memory only (not localStorage) to prevent XSS.
 * Refresh token lives in an httpOnly cookie server-side.
 *
 * No Provider needed — the store is a module-level singleton.
 * Use `useAuthStore` in any client component; use `authStore.state` outside React.
 */

import { Store } from '@tanstack/store';
import { useStore } from '@tanstack/react-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  avatarUrl?: string;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState: AuthState = {
  user: null,
  accessToken: null,
  isAuthenticated: false,
};

/** Module-level singleton — no Provider required. */
export const authStore = new Store<AuthState>(initialState);

// ---------------------------------------------------------------------------
// Session-restore promise — prevents request race on page load
// ---------------------------------------------------------------------------
// AuthProvider sets this to the in-flight restoreSession() promise so that
// the API client's request interceptor can await it before attaching the
// Bearer token. Without this, child components mount and fire API calls
// before AuthProvider has had a chance to hydrate the access token from the
// refresh token in localStorage, causing spurious 401s and a JTI replay race.

let _authRestorePromise: Promise<void> | null = null;

export function setAuthRestorePromise(p: Promise<void> | null): void {
  _authRestorePromise = p;
}

export function getAuthRestorePromise(): Promise<void> | null {
  return _authRestorePromise;
}

// ---------------------------------------------------------------------------
// Cookie helpers — sync access token with middleware
// ---------------------------------------------------------------------------

// Middleware reads 'kms-access-token' cookie to detect authenticated sessions.
// This token is in-memory only for API calls, but the cookie is needed so
// Next.js middleware (which runs server-side) can see the auth state.
// TTL matches the refresh token (7 days) so the session cookie outlives any
// single access token. The cookie value is not used for actual API auth.

const SESSION_COOKIE = 'kms-access-token';
const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function setSessionCookie(token: string): void {
  if (typeof document === 'undefined') return;
  // Only add Secure flag when running over HTTPS. Setting a Secure cookie on
  // an HTTP origin silently fails in all browsers, which would break local
  // dev and any HTTP-only preview deployments.
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureAttr = isHttps ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=${token}; path=/; SameSite=Lax${secureAttr}; max-age=${SESSION_COOKIE_MAX_AGE}`;
}

function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const secureAttr = isHttps ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=; path=/; SameSite=Lax${secureAttr}; max-age=0`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Set user + access token after successful login or token refresh. */
export function login(user: AuthUser, accessToken: string): void {
  authStore.setState(() => ({
    user,
    accessToken,
    isAuthenticated: true,
  }));
  setSessionCookie(accessToken);
}

/** Clear all auth state on logout. */
export function logout(): void {
  authStore.setState(() => initialState);
  clearSessionCookie();
}

/** Update the access token in-place (called after silent refresh). */
export function setAccessToken(token: string): void {
  authStore.setState((prev) => ({ ...prev, accessToken: token }));
  setSessionCookie(token);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the full auth state. Re-renders on any state change. */
export function useAuthState(): AuthState {
  return useStore(authStore, (s) => s);
}

/** Returns the current user. Re-renders only when the user object changes. */
export function useCurrentUser(): AuthUser | null {
  return useStore(authStore, (s) => s.user);
}

/** Returns whether the user is authenticated. */
export function useIsAuthenticated(): boolean {
  return useStore(authStore, (s) => s.isAuthenticated);
}

/** Returns the current access token (avoid logging or displaying). */
export function useAccessToken(): string | null {
  return useStore(authStore, (s) => s.accessToken);
}
