/**
 * Stores — barrel export
 *
 * All stores use TanStack Store (module-level singletons).
 * No Provider wrappers needed — import hooks directly in any client component.
 *
 * State ownership:
 * - Auth token + user identity  → authStore  (client UI state)
 * - Sidebar + theme             → uiStore    (client UI state)
 * - Search query + filters      → searchStore (client UI state)
 * - All server data (files, sources, search results, chat) → TanStack Query
 */

// Auth store
export {
  authStore,
  login,
  logout,
  setAccessToken,
  useAuthState,
  useCurrentUser,
  useIsAuthenticated,
  useAccessToken,
  type AuthUser,
  type AuthState,
} from './auth.store';

// UI store
export {
  uiStore,
  openSidebar,
  closeSidebar,
  toggleSidebar,
  collapseSidebar,
  expandSidebar,
  setTheme,
  useUiState,
  useSidebarOpen,
  useSidebarCollapsed,
  useTheme,
  ThemeSyncer,
  type Theme,
  type UiState,
} from './ui.store';

// Search store
export {
  searchStore,
  setSearchQuery,
  setSearchFilters,
  resetSearchFilters,
  setSearchPage,
  setSearchPageSize,
  clearSearch,
  useSearchParams,
  useSearchQuery,
  useSearchFilters,
  useSearchPagination,
  useSearchQueryKey,
  type SearchType,
  type SearchFilters,
  type SearchParams,
} from './search.store';
