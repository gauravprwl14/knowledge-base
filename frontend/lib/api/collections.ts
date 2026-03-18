/**
 * Collections API — typed wrappers over the /api/v1/collections endpoints.
 *
 * Collections group related files for scoped RAG queries.
 */

import { apiClient } from './client';

// ===========================================================================
// Types — aligned to CollectionResponseDto in kms-api
// ===========================================================================

/**
 * A collection as returned by the API.
 */
export interface KmsCollection {
  id: string;
  name: string;
  description?: string;
  /** Optional hex colour code for UI display (e.g. "#6366f1"). */
  color?: string;
  /** Optional icon identifier for UI display. */
  icon?: string;
  /** True if this is the user's default collection (cannot be deleted). */
  isDefault: boolean;
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
  color?: string;
  icon?: string;
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
   * PATCH /collections/:id — updates a collection's name, description, colour, or icon.
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
   * POST /collections/:id/files — adds files to a collection (bulk).
   */
  addFiles: (collectionId: string, fileIds: string[]): Promise<void> =>
    apiClient.post<void>(`/collections/${collectionId}/files`, { fileIds }),

  /**
   * DELETE /collections/:id/files/:fileId — removes a single file from a collection.
   *
   * NOTE: The backend only supports single-file removal.
   * To remove multiple files, iterate this method per fileId.
   * A bulk remove endpoint (DELETE /collections/:id/files with body) does NOT exist yet.
   */
  removeFile: (collectionId: string, fileId: string): Promise<void> =>
    apiClient.delete<void>(`/collections/${collectionId}/files/${fileId}`),
};
