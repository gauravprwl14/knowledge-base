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
// Actions
// ---------------------------------------------------------------------------

/** Set user + access token after successful login or token refresh. */
export function login(user: AuthUser, accessToken: string): void {
  authStore.setState(() => ({
    user,
    accessToken,
    isAuthenticated: true,
  }));
}

/** Clear all auth state on logout. */
export function logout(): void {
  authStore.setState(() => initialState);
}

/** Update the access token in-place (called after silent refresh). */
export function setAccessToken(token: string): void {
  authStore.setState((prev) => ({ ...prev, accessToken: token }));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the full auth state. Re-renders on any state change. */
export function useAuthState(): AuthState {
  return useStore(authStore);
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
