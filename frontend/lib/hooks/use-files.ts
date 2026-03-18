'use client';

/**
 * File and tag hooks — TanStack Query wrappers over filesApi and tagsApi.
 *
 * Each hook follows the pattern established in use-sources.ts:
 * - useQuery for reads (auto-fetches, cached by queryKey)
 * - useMutation for writes (invalidates related caches on success)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { filesApi, tagsApi } from '../api/files';
import type { ListFilesParams } from '../api/files';

// ===========================================================================
// Files hooks
// ===========================================================================

/**
 * Returns a paginated list of files, re-fetched whenever params change.
 * Params are serialised into the queryKey so each unique filter set is cached separately.
 */
export function useFiles(params: ListFilesParams = {}) {
  return useQuery({
    // Stringify params so deep equality works correctly as a cache key
    queryKey: ['files', params],
    queryFn: () => filesApi.list(params),
  });
}

/**
 * Returns a single file by ID.
 * Only fetches when a non-empty id is provided.
 */
export function useFile(id: string) {
  return useQuery({
    queryKey: ['files', id],
    queryFn: () => filesApi.get(id),
    enabled: !!id,
  });
}

/**
 * Mutation to delete a single file.
 * Invalidates the files list on success.
 */
export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => filesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

/**
 * Mutation to bulk-delete multiple files.
 * Invalidates the files list on success.
 */
export function useBulkDeleteFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileIds: string[]) => filesApi.bulkDelete(fileIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

// ===========================================================================
// Tags hooks
// ===========================================================================

/**
 * Returns all tags for the authenticated user.
 */
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
  });
}

/**
 * Mutation to create a new tag.
 * Invalidates the tags list on success.
 */
export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      tagsApi.create(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

/**
 * Mutation to update an existing tag's name or color.
 * Invalidates the tags list on success.
 */
export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name?: string;
      color?: string;
    }) => tagsApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  });
}

/**
 * Mutation to delete a tag.
 * Invalidates both tags and files (since file tag arrays change) on success.
 */
export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      // Invalidate both caches — file cards embed tag chips
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

/**
 * Mutation to add a tag to a single file.
 * Invalidates files so tag chips re-render.
 */
export function useAddTagToFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, tagId }: { fileId: string; tagId: string }) =>
      tagsApi.addToFile(fileId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

/**
 * Mutation to remove a tag from a single file.
 */
export function useRemoveTagFromFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileId, tagId }: { fileId: string; tagId: string }) =>
      tagsApi.removeFromFile(fileId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

/**
 * Mutation to apply a tag to multiple selected files at once.
 * Invalidates both tags (fileCount changes) and files on success.
 */
export function useBulkTagFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileIds, tagId }: { fileIds: string[]; tagId: string }) =>
      tagsApi.bulkTag(fileIds, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}
