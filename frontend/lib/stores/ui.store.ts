'use client';

/**
 * UI Store — TanStack Store
 *
 * Manages: sidebar open/collapsed state, theme (dark/light/system).
 * No Provider needed — module-level singleton.
 *
 * Theme side-effect (syncing `.dark` class to <html>) is handled by the
 * `ThemeSyncer` component — mount it once in the root layout.
 */

import { Store } from '@tanstack/store';
import { useStore } from '@tanstack/react-store';
import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Theme = 'dark' | 'light' | 'system';

export interface UiState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  theme: Theme;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialState: UiState = {
  sidebarOpen: true,
  sidebarCollapsed: false,
  theme: 'dark',
};

/** Module-level singleton — no Provider required. */
export const uiStore = new Store<UiState>(initialState);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function openSidebar(): void {
  uiStore.setState((prev) => ({ ...prev, sidebarOpen: true }));
}

export function closeSidebar(): void {
  uiStore.setState((prev) => ({ ...prev, sidebarOpen: false }));
}

export function toggleSidebar(): void {
  uiStore.setState((prev) => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
}

export function collapseSidebar(): void {
  uiStore.setState((prev) => ({ ...prev, sidebarCollapsed: true }));
}

export function expandSidebar(): void {
  uiStore.setState((prev) => ({ ...prev, sidebarCollapsed: false }));
}

export function setTheme(theme: Theme): void {
  uiStore.setState((prev) => ({ ...prev, theme }));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns the full UI state. */
export function useUiState(): UiState {
  return useStore(uiStore, (s) => s);
}

/** Returns whether the sidebar is open (mobile overlay). */
export function useSidebarOpen(): boolean {
  return useStore(uiStore, (s) => s.sidebarOpen);
}

/** Returns whether the sidebar is collapsed to icon-only mode. */
export function useSidebarCollapsed(): boolean {
  return useStore(uiStore, (s) => s.sidebarCollapsed);
}

/** Returns the active theme setting. */
export function useTheme(): Theme {
  return useStore(uiStore, (s) => s.theme);
}

// ---------------------------------------------------------------------------
// ThemeSyncer — mount once in the root layout
// ---------------------------------------------------------------------------

/**
 * Syncs the `theme` value from uiStore to the `<html>` element's class list.
 * Must be a client component — mount inside the app shell, not in a Server Component.
 *
 * @example
 * ```tsx
 * // In layout.tsx or a client shell component:
 * import { ThemeSyncer } from '@/lib/stores/ui.store';
 * <ThemeSyncer />
 * ```
 */
export function ThemeSyncer(): null {
  const theme = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const applyDark = (dark: boolean) =>
      dark ? root.classList.add('dark') : root.classList.remove('dark');

    if (theme === 'dark') {
      applyDark(true);
      return;
    }

    if (theme === 'light') {
      applyDark(false);
      return;
    }

    // 'system' — follow OS preference and keep in sync
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyDark(mq.matches);

    const handler = (e: MediaQueryListEvent) => applyDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return null;
}
