/**
<<<<<<< HEAD
 * Collections API — typed wrappers over the /api/v1/collections endpoints.
=======
 * Collections API — typed methods for the /collections resource.
 *
 * Collections group related files for scoped RAG queries.
>>>>>>> feat/drive-frontend
 */

import { apiClient } from './client';

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Collection {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isDefault: boolean;
  fileCount: number;
  createdAt: string;
}

export interface CreateCollectionPayload {
  name: string;
  description?: string;
  color?: string;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

=======
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
>>>>>>> feat/drive-frontend
export const collectionsApi = {
  /**
   * GET /collections — returns all collections for the authenticated user.
   */
<<<<<<< HEAD
  list: (): Promise<Collection[]> => apiClient.get<Collection[]>('/collections'),
=======
  list: (): Promise<KmsCollection[]> =>
    apiClient.get<KmsCollection[]>('/collections'),

  /**
   * GET /collections/:id — returns a single collection.
   */
  get: (id: string): Promise<KmsCollection> =>
    apiClient.get<KmsCollection>(`/collections/${id}`),
>>>>>>> feat/drive-frontend

  /**
   * POST /collections — creates a new collection.
   */
<<<<<<< HEAD
  create: (data: CreateCollectionPayload): Promise<Collection> =>
    apiClient.post<Collection>('/collections', data),

  /**
   * DELETE /collections/:id — deletes a collection (does not delete its files).
   */
  delete: (id: string): Promise<void> => apiClient.delete<void>(`/collections/${id}`),
=======
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
>>>>>>> feat/drive-frontend

  /**
   * POST /collections/:id/files — adds files to a collection.
   */
<<<<<<< HEAD
  addFiles: (id: string, fileIds: string[]): Promise<{ added: number }> =>
    apiClient.post<{ added: number }>(`/collections/${id}/files`, { fileIds }),
=======
  addFiles: (collectionId: string, fileIds: string[]): Promise<void> =>
    apiClient.post<void>(`/collections/${collectionId}/files`, { fileIds }),

  /**
   * DELETE /collections/:id/files — removes files from a collection.
   */
  removeFiles: (collectionId: string, fileIds: string[]): Promise<void> =>
    apiClient.delete<void>(`/collections/${collectionId}/files`, {
      data: { fileIds },
    }),
>>>>>>> feat/drive-frontend
};
