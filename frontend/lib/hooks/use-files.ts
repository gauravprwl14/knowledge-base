'use client';

/**
 * Files hooks — React Query wrappers for /files API endpoints.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesApi, type FilesListParams, type KmsFile } from '@/lib/api/files';

export const FILES_QUERY_KEY = ['files'] as const;

// ---------------------------------------------------------------------------
// List files
// ---------------------------------------------------------------------------

/**
 * Fetches the paginated list of files, optionally filtered.
 * Data is considered stale after 30 seconds.
 */
export function useFiles(params?: FilesListParams) {
  return useQuery({
    queryKey: [...FILES_QUERY_KEY, params] as const,
    queryFn: () => filesApi.list(params),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Single file
// ---------------------------------------------------------------------------

/**
 * Fetches a single file by ID.
 */
export function useFile(id: string | null) {
  return useQuery({
    queryKey: [...FILES_QUERY_KEY, id] as const,
    queryFn: () => filesApi.get(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Delete single file
// ---------------------------------------------------------------------------

/**
 * Mutation to delete a single file.
 * Applies an optimistic update: removes the file from cached list immediately,
 * then invalidates to refetch on success.
 */
export function useDeleteFile() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => filesApi.delete(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: FILES_QUERY_KEY });

      // Snapshot all file-list cache entries for rollback
      const previous = qc.getQueriesData<{ items: KmsFile[]; total: number }>({
        queryKey: FILES_QUERY_KEY,
      });

      // Optimistically remove the file
      qc.setQueriesData<{ items: KmsFile[]; total: number }>(
        { queryKey: FILES_QUERY_KEY },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((f) => f.id !== id),
            total: Math.max(0, old.total - 1),
          };
        },
      );

      return { previous };
    },
    onError: (_err, _id, context) => {
      // Roll back optimistic update
      if (context?.previous) {
        for (const [key, value] of context.previous) {
          qc.setQueryData(key, value);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: FILES_QUERY_KEY });
    },
  });
}

// ---------------------------------------------------------------------------
// Bulk delete files
// ---------------------------------------------------------------------------

/**
 * Mutation to delete multiple files at once.
 * Invalidates the files list cache on success.
 */
export function useBulkDeleteFiles() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => filesApi.bulkDelete(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FILES_QUERY_KEY });
    },
  });
}
