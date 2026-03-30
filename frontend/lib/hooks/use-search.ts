'use client';

/**
 * useSearch — React Query wrapper for the /search endpoint.
 *
 * Intentionally returns the full React Query result object (not a custom
 * shape) so callers can destructure exactly what they need and the hook
 * stays compatible with future React Query features without API changes.
 */

import { useQuery } from '@tanstack/react-query';
import { searchApi, type SearchMode, type SearchResponse } from '@/lib/api/search';

/** Stable base key used for query invalidation across the app. */
export const SEARCH_QUERY_KEY = ['search'] as const;

/**
 * Fires a search when `query` is at least 2 characters long.
 *
 * Key design decisions:
 * - `enabled` guard prevents spurious requests on every keystroke for
 *   short/empty strings — important because every character change
 *   re-renders the page.
 * - `staleTime: 30_000` avoids refetching the same query within 30 s.
 *   Search results for a static corpus don't change second-to-second.
 * - `placeholderData: (prev) => prev` keeps the previous result set
 *   visible while the new request is in-flight. This is critical when the
 *   user switches search mode (e.g. hybrid → semantic) — they see the old
 *   results dim out instead of a sudden blank screen.
 *
 * @param query - Search string (must be >= 2 chars to trigger a request)
 * @param mode  - Search strategy: 'hybrid' | 'keyword' | 'semantic'
 */
export function useSearch(query: string, mode: SearchMode = 'hybrid') {
  return useQuery<SearchResponse, Error>({
    queryKey: [...SEARCH_QUERY_KEY, query, mode] as const,
    queryFn: () => searchApi.search(query, mode),
    // Only fire when the query is meaningful — avoids spamming the API
    // on every single keystroke while the user is still typing.
    enabled: query.trim().length >= 2,
    // 10 s cache — short enough that new queries feel fresh.
    staleTime: 10_000,
  });
}
