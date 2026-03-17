'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kmsSourcesApi } from '../api/sources';

/**
 * Returns all knowledge sources for the authenticated user.
 * Data is automatically refetched when stale.
 */
export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: kmsSourcesApi.list,
  });
}

/**
 * Mutation to disconnect a source by ID.
 * Invalidates the sources list cache on success.
 */
export function useDisconnectSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kmsSourcesApi.disconnect(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}
