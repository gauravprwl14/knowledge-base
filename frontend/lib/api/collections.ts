/**
 * Collections API — typed wrappers over the /api/v1/collections endpoints.
 */

import { apiClient } from './client';

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

export const collectionsApi = {
  /**
   * GET /collections — returns all collections for the authenticated user.
   */
  list: (): Promise<Collection[]> => apiClient.get<Collection[]>('/collections'),

  /**
   * POST /collections — creates a new collection.
   */
  create: (data: CreateCollectionPayload): Promise<Collection> =>
    apiClient.post<Collection>('/collections', data),

  /**
   * DELETE /collections/:id — deletes a collection (does not delete its files).
   */
  delete: (id: string): Promise<void> => apiClient.delete<void>(`/collections/${id}`),

  /**
   * POST /collections/:id/files — adds files to a collection.
   */
  addFiles: (id: string, fileIds: string[]): Promise<{ added: number }> =>
    apiClient.post<{ added: number }>(`/collections/${id}/files`, { fileIds }),
};
