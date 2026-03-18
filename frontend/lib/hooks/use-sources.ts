'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kmsSourcesApi, localSourcesApi } from '../api/sources';
import { apiClient } from '../api/client';

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

/**
 * Mutation to register an Obsidian vault by filesystem path.
 * Invalidates the sources list cache on success.
 */
export function useRegisterObsidianVault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vaultPath, displayName }: { vaultPath: string; displayName?: string }) =>
      localSourcesApi.registerObsidian(vaultPath, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

/**
 * Mutation to register a local folder source by filesystem path.
 * Invalidates the sources list cache on success.
 */
export function useRegisterLocalSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, displayName }: { path: string; displayName?: string }) =>
      localSourcesApi.registerLocal(path, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

/**
 * Mutation to trigger a scan on a source.
 * Supports FULL (re-index everything) and INCREMENTAL (new files only).
 * Invalidates the sources list cache on success.
 */
export function useTriggerScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceId,
      scanType = 'FULL',
    }: {
      sourceId: string;
      scanType?: 'FULL' | 'INCREMENTAL';
    }) =>
      apiClient.post<{ id: string; status: string }>(`/sources/${sourceId}/scan`, { scanType }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}

/**
 * Polls the scan history for a given source every 5 seconds.
 * Only actively polls when `enabled` is true (i.e. a scan is in progress).
 */
export function useScanHistory(sourceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['sources', sourceId, 'scan-history'],
    queryFn: () =>
      apiClient.get<Array<{ id: string; status: string; startedAt: string; completedAt?: string }>>(
        `/sources/${sourceId}/scan-history`,
      ),
    refetchInterval: enabled ? 5_000 : false,
    enabled: Boolean(sourceId),
  });
}
