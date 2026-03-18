'use client';

/**
 * Search hook — React Query wrapper for the /search endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { searchApi, type SearchMode, type SearchResult } from '@/lib/api/search';

export const SEARCH_QUERY_KEY = ['search'] as const;

/**
 * Performs a search query when the query string has at least 2 characters.
 *
 * @param query - Search string (must be >= 2 chars to trigger)
 * @param mode - Search mode: 'hybrid', 'keyword', or 'semantic'
 * @param limit - Max results to return
 */
export function useSearch(
  query: string,
  mode: SearchMode = 'hybrid',
  limit = 20,
): {
  results: SearchResult[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const enabled = query.trim().length >= 2;

  const q = useQuery({
    queryKey: [...SEARCH_QUERY_KEY, query, mode, limit] as const,
    queryFn: () => searchApi.search(query, mode, limit),
    enabled,
    staleTime: 30_000,
  });

  return {
    results: q.data ?? [],
    isLoading: q.isLoading && enabled,
    isError: q.isError,
    error: q.error instanceof Error ? q.error : null,
    refetch: q.refetch,
  };
}
