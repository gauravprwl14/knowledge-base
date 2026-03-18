/**
 * Files API — typed wrappers over the /api/v1/files endpoints.
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FileStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
export type SourceType = 'LOCAL' | 'OBSIDIAN' | 'GOOGLE_DRIVE';
export type MimeGroup = 'documents' | 'images' | 'audio' | 'video' | 'data';

export interface KmsFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  sourceId: string;
  sourceType: SourceType;
  checksumSha256?: string;
  extractedText?: string;
  externalModifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FilesListParams {
  sourceId?: string;
  mimeGroup?: MimeGroup;
  status?: FileStatus;
  page?: number;
  pageSize?: number;
}

export interface FilesListResponse {
  items: KmsFile[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

export const filesApi = {
  /**
   * GET /files — returns a paginated list of files with optional filters.
   */
  list: (params?: FilesListParams): Promise<FilesListResponse> => {
    const query = new URLSearchParams();
    if (params?.sourceId) query.set('sourceId', params.sourceId);
    if (params?.mimeGroup) query.set('mimeGroup', params.mimeGroup);
    if (params?.status) query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return apiClient.get<FilesListResponse>(`/files${qs ? `?${qs}` : ''}`);
  },

  /**
   * GET /files/:id — returns a single file with full metadata.
   */
  get: (id: string): Promise<KmsFile> => apiClient.get<KmsFile>(`/files/${id}`),

  /**
   * DELETE /files/:id — permanently deletes a file record.
   */
  delete: (id: string): Promise<void> => apiClient.delete<void>(`/files/${id}`),

  /**
   * POST /files/bulk-delete — deletes multiple file records.
   */
  bulkDelete: (ids: string[]): Promise<{ deleted: number }> =>
    apiClient.post<{ deleted: number }>('/files/bulk-delete', { ids }),
};
