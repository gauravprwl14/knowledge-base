/**
 * Files API — typed wrappers over the /api/v1/files and /api/v1/tags endpoints.
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
export type FileStatus = 'PENDING' | 'PROCESSING' | 'INDEXED' | 'ERROR' | 'UNSUPPORTED' | 'DELETED';

/**
 * Derived embedding status returned by the API alongside the raw status.
 * Computed server-side from the FileStatus column — no extra DB query needed.
 *
 * Mapping:
 *   PENDING       → "pending"
 *   PROCESSING    → "processing"
 *   INDEXED       → "embedded"
 *   ERROR         → "failed"
 *   UNSUPPORTED   → "unsupported"
 *   DELETED       → "deleted"
 */
export type EmbeddingStatus = 'pending' | 'processing' | 'embedded' | 'failed' | 'unsupported' | 'deleted';

/**
 * MIME group categories for filtering.
 */
export type MimeGroup = 'document' | 'image' | 'audio' | 'video' | 'spreadsheet' | 'other';

/**
 * Tag reference as embedded in a KmsFile response.
 */
export interface KmsFileTag {
  id: string;
  name: string;
  color: string;
}

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
  /** Derived embedding status — computed server-side from status column (FR-01). */
  embeddingStatus?: EmbeddingStatus;
  sourceId: string;
  collectionId: string | null;
  tags: KmsFileTag[];
  indexedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===========================================================================
// Transcription types
// ===========================================================================

/**
 * Transcription job status for an audio or video file.
 * Mirrors the backend VoiceJob schema returned by GET /files/:id/transcription.
 */
export interface TranscriptionStatus {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  language: string | null;
  durationSeconds: number | null;
  completedAt: string | null;
  errorMsg: string | null;
  modelUsed: string | null;
  createdAt: string;
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
  /**
   * Filter by derived embedding status (FR-13).
   * Maps to the underlying FileStatus on the backend.
   */
  embeddingStatus?: EmbeddingStatus;
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
const _realFilesApi = {
  /**
   * GET /files — returns a cursor-paginated list of files with optional filters.
   */
  list: (params: ListFilesParams = {}): Promise<ListFilesResponse> => {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.sourceId) qs.set('sourceId', params.sourceId);
    if (params.mimeGroup) qs.set('mimeGroup', params.mimeGroup);
    if (params.embeddingStatus) qs.set('embeddingStatus', params.embeddingStatus);
    else if (params.status) qs.set('status', params.status);
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
  bulkDelete: (ids: string[]): Promise<{ deleted: number }> =>
    apiClient.post<{ deleted: number }>('/files/bulk-delete', { ids }),

  /**
   * POST /files/bulk-re-embed — resets file status to PENDING and re-queues
   * up to 100 files for embedding. Files not owned by the user are ignored.
   * Returns `{ queued: N }` where N is the count of files actually queued.
   */
  bulkReEmbed: (ids: string[]): Promise<{ queued: number }> =>
    apiClient.post<{ queued: number }>('/files/bulk-re-embed', { ids }),

  /**
   * POST /files/:id/retry — re-queues a failed file for processing.
   * Resets the file status to PENDING and triggers a new scan/embed pipeline run.
   */
  retry: (id: string): Promise<void> =>
    apiClient.post<void>(`/files/${id}/retry`),

  /**
   * POST /files/:id/reindex — deletes existing chunks and re-queues the file
   * for the full embed pipeline. Returns `{ fileId, status: 'queued' }`.
   */
  reindexFile: (id: string): Promise<{ fileId: string; status: string }> =>
    apiClient.post<{ fileId: string; status: string }>(`/files/${id}/reindex`),

  /**
   * GET /files/:id/transcription — returns transcription job status for audio/video files.
   * Returns null when no transcription job exists for the file.
   */
  getTranscription: (fileId: string): Promise<TranscriptionStatus | null> =>
    apiClient.get<TranscriptionStatus | null>(`/files/${fileId}/transcription`),
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
const _realTagsApi = {
  list: (): Promise<KmsTag[]> => apiClient.get<KmsTag[]>('/tags'),
  create: (name: string, color: string): Promise<KmsTag> => apiClient.post<KmsTag>('/tags', { name, color }),
  update: (id: string, payload: Partial<{ name: string; color: string }>): Promise<KmsTag> => apiClient.patch<KmsTag>(`/tags/${id}`, payload),
  delete: (id: string): Promise<void> => apiClient.delete<void>(`/tags/${id}`),
  addToFile: (fileId: string, tagId: string): Promise<void> => apiClient.post<void>(`/files/${fileId}/tags/${tagId}`),
  removeFromFile: (fileId: string, tagId: string): Promise<void> => apiClient.delete<void>(`/files/${fileId}/tags/${tagId}`),
  bulkTag: (fileIds: string[], tagId: string): Promise<void> => apiClient.post<void>('/files/bulk-tag', { fileIds, tagId }),
};

// ── Mock swap ───────────────────────────────────────────────────────────────
// To use real API: remove NEXT_PUBLIC_USE_MOCK from .env.local (or set to false).

import { mockFilesApi, mockTagsApi } from '@/lib/mock/handlers/files.mock';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

export const filesApi = USE_MOCK ? mockFilesApi : _realFilesApi;
export const tagsApi = USE_MOCK ? mockTagsApi : _realTagsApi;
