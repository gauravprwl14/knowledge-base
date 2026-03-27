'use client';

/**
 * Collections hooks — TanStack Query wrappers over collectionsApi.
 *
 * Follows the same pattern as use-sources.ts and use-files.ts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionsApi } from '../api/collections';
import type { CreateCollectionPayload } from '../api/collections';

// ===========================================================================
// Read hooks
// ===========================================================================

/**
 * Returns all collections for the authenticated user.
 */
export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: collectionsApi.list,
  });
}

/**
 * Returns a single collection by ID.
 * Only fetches when a non-empty id is provided.
 */
export function useCollection(id: string) {
  return useQuery({
    queryKey: ['collections', id],
    queryFn: () => collectionsApi.get(id),
    enabled: !!id,
  });
}

// ===========================================================================
// Mutation hooks
// ===========================================================================

/**
 * Mutation to create a new collection.
 * Invalidates the collections list on success.
 */
export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCollectionPayload) =>
      collectionsApi.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });
}

/**
 * Mutation to update a collection's name or description.
 */
export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & Partial<CreateCollectionPayload>) =>
      collectionsApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });
}

/**
 * Mutation to delete a collection.
 * Files inside are not deleted — only the collection record is removed.
 */
export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => collectionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collections'] }),
  });
}

/**
 * Mutation to add files to a collection.
 * Invalidates both collections (fileCount) and files (collectionId field) on success.
 */
export function useAddFilesToCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      fileIds,
    }: {
      collectionId: string;
      fileIds: string[];
    }) => collectionsApi.addFiles(collectionId, fileIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

/**
 * Mutation to remove files from a collection.
 */
export function useRemoveFilesFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      collectionId,
      fileIds,
    }: {
      collectionId: string;
      fileIds: string[];
    }) => collectionsApi.removeFiles(collectionId, fileIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}
