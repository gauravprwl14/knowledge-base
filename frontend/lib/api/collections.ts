/**
 * Collections API — typed methods for the /collections resource.
 *
 * Collections group related files for scoped RAG queries.
 */

import { apiClient } from './client';

// ===========================================================================
// Types
// ===========================================================================

/**
 * A collection as returned by the API.
 */
export interface KmsCollection {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for creating a new collection.
 */
export interface CreateCollectionPayload {
  name: string;
  description?: string;
}

// ===========================================================================
// API
// ===========================================================================

/**
 * Typed API methods for the /collections resource.
 */
export const collectionsApi = {
  /**
   * GET /collections — returns all collections for the authenticated user.
   */
  list: (): Promise<KmsCollection[]> =>
    apiClient.get<KmsCollection[]>('/collections'),

  /**
   * GET /collections/:id — returns a single collection.
   */
  get: (id: string): Promise<KmsCollection> =>
    apiClient.get<KmsCollection>(`/collections/${id}`),

  /**
   * POST /collections — creates a new collection.
   */
  create: (payload: CreateCollectionPayload): Promise<KmsCollection> =>
    apiClient.post<KmsCollection>('/collections', payload),

  /**
   * PATCH /collections/:id — updates a collection's name or description.
   */
  update: (
    id: string,
    payload: Partial<CreateCollectionPayload>,
  ): Promise<KmsCollection> =>
    apiClient.patch<KmsCollection>(`/collections/${id}`, payload),

  /**
   * DELETE /collections/:id — removes a collection (files are not deleted).
   */
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/collections/${id}`),

  /**
   * POST /collections/:id/files — adds files to a collection.
   */
  addFiles: (collectionId: string, fileIds: string[]): Promise<void> =>
    apiClient.post<void>(`/collections/${collectionId}/files`, { fileIds }),

  /**
   * DELETE /collections/:id/files — removes files from a collection.
   */
  removeFiles: (collectionId: string, fileIds: string[]): Promise<void> =>
    apiClient.delete<void>(`/collections/${collectionId}/files`, {
      data: { fileIds },
    }),
};
