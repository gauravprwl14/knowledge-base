/**
 * Files API — typed methods for the /files and /tags resources.
 *
 * Uses cursor-based pagination (cursor + limit) matching the backend contract.
 * All methods delegate to the shared apiClient (JWT auth + auto-refresh).
 */

import { apiClient } from './client';

// ===========================================================================
// Shared types
// ===========================================================================

/**
 * File processing status — mirrors the backend FileStatus enum.
 */
export type FileStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR';

/**
 * MIME group categories for filtering.
 */
export type MimeGroup = 'document' | 'image' | 'audio' | 'video' | 'spreadsheet' | 'other';

/**
 * A file in the knowledge base as returned by the API.
 */
export interface KmsFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  sourceId: string;
  collectionId: string | null;
  tags: KmsFileTag[];
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tag reference as embedded in a KmsFile response.
 */
export interface KmsFileTag {
  id: string;
  name: string;
  color: string;
}

// ===========================================================================
// Files API
// ===========================================================================

/**
 * Parameters for listing files with cursor pagination and optional filters.
 */
export interface ListFilesParams {
  /** Opaque cursor from the previous page's nextCursor field */
  cursor?: string;
  /** Number of items to return (default 20) */
  limit?: number;
  /** Filter by source ID */
  sourceId?: string;
  /** Filter by MIME group (document, image, audio, etc.) */
  mimeGroup?: MimeGroup;
  /** Filter by processing status */
  status?: FileStatus;
  /** Filter by collection ID */
  collectionId?: string;
  /** Filter by tag names (AND semantics) */
  tags?: string[];
  /** Search within filename (case-insensitive substring) */
  search?: string;
  /** Sort field */
  sortBy?: 'name' | 'createdAt' | 'sizeBytes' | 'mimeType';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
}

/**
 * Paginated list response using cursor pagination.
 */
export interface ListFilesResponse {
  items: KmsFile[];
  /** Opaque cursor for the next page; absent when no more pages exist */
  nextCursor?: string;
  /** Total count of matching files (for display purposes) */
  total: number;
}

/**
 * Typed API methods for the /files resource.
 */
export const filesApi = {
  /**
   * GET /files — returns a cursor-paginated list of files with optional filters.
   */
  list: (params: ListFilesParams = {}): Promise<ListFilesResponse> => {
    // Build query string from non-undefined params
    const qs = new URLSearchParams();
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.sourceId) qs.set('sourceId', params.sourceId);
    if (params.mimeGroup) qs.set('mimeGroup', params.mimeGroup);
    if (params.status) qs.set('status', params.status);
    if (params.collectionId) qs.set('collectionId', params.collectionId);
    if (params.tags?.length) qs.set('tags', params.tags.join(','));
    if (params.search) qs.set('search', params.search);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortDir) qs.set('sortDir', params.sortDir);
    return apiClient.get<ListFilesResponse>(`/files?${qs.toString()}`);
  },

  /**
   * GET /files/:id — returns a single file by ID.
   */
  get: (id: string): Promise<KmsFile> =>
    apiClient.get<KmsFile>(`/files/${id}`),

  /**
   * DELETE /files/:id — permanently deletes a file.
   */
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/files/${id}`),

  /**
   * POST /files/bulk-delete — deletes multiple files at once.
   */
  bulkDelete: (fileIds: string[]): Promise<void> =>
    apiClient.post<void>('/files/bulk-delete', { fileIds }),
};

// ===========================================================================
// Tags API
// ===========================================================================

/**
 * A user-defined tag that can be applied to files.
 */
export interface KmsTag {
  id: string;
  name: string;
  /** Hex color string (e.g. "#6366f1") */
  color: string;
  /** Number of files carrying this tag */
  fileCount: number;
  createdAt: string;
}

/**
 * Typed API methods for the /tags resource.
 */
export const tagsApi = {
  /**
   * GET /tags — returns all tags for the authenticated user.
   */
  list: (): Promise<KmsTag[]> =>
    apiClient.get<KmsTag[]>('/tags'),

  /**
   * POST /tags — creates a new tag.
   */
  create: (name: string, color: string): Promise<KmsTag> =>
    apiClient.post<KmsTag>('/tags', { name, color }),

  /**
   * PATCH /tags/:id — updates a tag's name or color.
   */
  update: (id: string, payload: Partial<{ name: string; color: string }>): Promise<KmsTag> =>
    apiClient.patch<KmsTag>(`/tags/${id}`, payload),

  /**
   * DELETE /tags/:id — removes a tag (and all file associations).
   */
  delete: (id: string): Promise<void> =>
    apiClient.delete<void>(`/tags/${id}`),

  /**
   * POST /files/:fileId/tags/:tagId — adds a tag to a single file.
   */
  addToFile: (fileId: string, tagId: string): Promise<void> =>
    apiClient.post<void>(`/files/${fileId}/tags/${tagId}`),

  /**
   * DELETE /files/:fileId/tags/:tagId — removes a tag from a single file.
   */
  removeFromFile: (fileId: string, tagId: string): Promise<void> =>
    apiClient.delete<void>(`/files/${fileId}/tags/${tagId}`),

  /**
   * POST /files/bulk-tag — applies a tag to multiple files at once.
   */
  bulkTag: (fileIds: string[], tagId: string): Promise<void> =>
    apiClient.post<void>('/files/bulk-tag', { fileIds, tagId }),
};
