'use client';

/**
 * Collections hooks — React Query wrappers for /collections API endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi, type CreateCollectionPayload } from '@/lib/api/collections';

export const COLLECTIONS_QUERY_KEY = ['collections'] as const;

// ---------------------------------------------------------------------------
// List collections
// ---------------------------------------------------------------------------

/**
 * Fetches all collections for the authenticated user.
 */
export function useCollections() {
  return useQuery({
    queryKey: COLLECTIONS_QUERY_KEY,
    queryFn: collectionsApi.list,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Create collection
// ---------------------------------------------------------------------------

/**
 * Mutation to create a new collection.
 * Invalidates the collections list cache on success.
 */
export function useCreateCollection() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCollectionPayload) => collectionsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete collection
// ---------------------------------------------------------------------------

/**
 * Mutation to delete a collection by ID.
 * Invalidates the collections list cache on success.
 */
export function useDeleteCollection() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: COLLECTIONS_QUERY_KEY });
    },
  });
}
