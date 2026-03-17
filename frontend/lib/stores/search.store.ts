/**
 * Search Store — TanStack Store (UI state only)
 *
 * Holds: query string, filters, and pagination cursor.
 * Search RESULTS are server state — use TanStack Query:
 *
 * ```tsx
 * const { query, filters, page } = useSearchParams();
 * const { data } = useQuery({
 *   queryKey: ['search', query, filters, page],
 *   queryFn: () => searchApi.search({ q: query, ...filters, page }),
 *   enabled: query.length > 0,
 * });
 * ```
 *
 * No Provider needed — module-level singleton.
 */

import { Store } from '@tanstack/store';
import { useStore } from '@tanstack/react-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchType = 'keyword' | 'semantic' | 'hybrid';

export interface SearchFilters {
  type: SearchType;
  sourceIds: string[];
  collectionIds: string[];
  fileTypes: string[];
  dateFrom: string | null;
  dateTo: string | null;
}

export interface SearchParams {
  query: string;
  filters: SearchFilters;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: SearchFilters = {
  type: 'hybrid',
  sourceIds: [],
  collectionIds: [],
  fileTypes: [],
  dateFrom: null,
  dateTo: null,
};

const initialState: SearchParams = {
  query: '',
  filters: DEFAULT_FILTERS,
  page: 1,
  pageSize: 20,
};

/** Module-level singleton — no Provider required. */
export const searchStore = new Store<SearchParams>(initialState);

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Update the search query and reset to page 1. */
export function setSearchQuery(query: string): void {
  searchStore.setState((prev) => ({ ...prev, query, page: 1 }));
}

/** Merge partial filter updates and reset to page 1. */
export function setSearchFilters(filters: Partial<SearchFilters>): void {
  searchStore.setState((prev) => ({
    ...prev,
    filters: { ...prev.filters, ...filters },
    page: 1,
  }));
}

/** Reset all filters to defaults and return to page 1. */
export function resetSearchFilters(): void {
  searchStore.setState((prev) => ({ ...prev, filters: DEFAULT_FILTERS, page: 1 }));
}

/** Navigate to a specific page. */
export function setSearchPage(page: number): void {
  searchStore.setState((prev) => ({ ...prev, page }));
}

/** Change the number of results per page and reset to page 1. */
export function setSearchPageSize(pageSize: number): void {
  searchStore.setState((prev) => ({ ...prev, pageSize, page: 1 }));
}

/** Clear the query and reset everything to initial state. */
export function clearSearch(): void {
  searchStore.setState(() => initialState);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Returns all search params. Re-renders on any change. */
export function useSearchParams(): SearchParams {
  return useStore(searchStore);
}

/** Returns just the query string. Re-renders only when query changes. */
export function useSearchQuery(): string {
  return useStore(searchStore, (s) => s.query);
}

/** Returns the active search filters. */
export function useSearchFilters(): SearchFilters {
  return useStore(searchStore, (s) => s.filters);
}

/** Returns current page and page size. */
export function useSearchPagination(): { page: number; pageSize: number } {
  return useStore(searchStore, (s) => ({ page: s.page, pageSize: s.pageSize }));
}

/** Returns the TanStack Query key for the current search params — use as queryKey. */
export function useSearchQueryKey(): ['search', SearchParams] {
  const params = useStore(searchStore);
  return ['search', params];
}
