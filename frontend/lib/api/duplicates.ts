/**
 * Duplicates API — typed wrappers over GET /api/v1/files/duplicates.
 *
 * Provides a real implementation that delegates to the shared apiClient
 * (JWT auth + auto-refresh) and a mock implementation for local development
 * or Storybook.  Switch between them via NEXT_PUBLIC_USE_MOCK=true.
 */

import { apiClient } from './client';

// ===========================================================================
// Types
// ===========================================================================

/**
 * A single file within a duplicate group.
 *
 * `originalFilename` is the name stored when the file was first discovered.
 * `fileSize` is in bytes.
 */
export interface DuplicateFile {
  id: string;
  originalFilename: string;
  fileSize: number;
  sourceId: string;
  createdAt: string;
}

/**
 * A group of files that share the same SHA-256 checksum.
 *
 * The `files` array is ordered oldest → newest.  The first file is the
 * canonical "keep" copy; all subsequent files are duplicates.
 */
export interface DuplicateGroup {
  /** SHA-256 hash shared by every file in this group. */
  checksum: string;
  /**
   * Sum of `fileSize` for all non-canonical files (i.e. bytes wasted by
   * keeping the duplicates).
   */
  totalWastedBytes: number;
  /** Files ordered oldest → newest. */
  files: DuplicateFile[];
}

/** Shape of the `GET /files/duplicates` response payload. */
export interface DuplicatesResponse {
  groups: DuplicateGroup[];
}

// ===========================================================================
// Real implementation
// ===========================================================================

const _realDuplicatesApi = {
  /**
   * Fetches all duplicate file groups for the authenticated user.
   *
   * @returns A `DuplicatesResponse` with a `groups` array.
   */
  list: (): Promise<DuplicatesResponse> =>
    apiClient.get<DuplicatesResponse>('/files/duplicates'),

  /**
   * Hard-deletes a single file.  Used to remove a duplicate while keeping the
   * canonical copy.
   *
   * @param fileId - UUID of the file to delete.
   */
  deleteFile: (fileId: string): Promise<void> =>
    apiClient.delete<void>(`/files/${fileId}`),
};

// ===========================================================================
// Mock implementation
// ===========================================================================

const _mockDuplicatesApi = {
  list: async (): Promise<DuplicatesResponse> => {
    await new Promise((r) => setTimeout(r, 300));
    return {
      groups: [
        {
          checksum: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
          totalWastedBytes: 204800,
          files: [
            {
              id: 'file-001',
              originalFilename: 'report-final.pdf',
              fileSize: 204800,
              sourceId: 'src-001',
              createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
            },
            {
              id: 'file-002',
              originalFilename: 'report-final-copy.pdf',
              fileSize: 204800,
              sourceId: 'src-001',
              createdAt: new Date(Date.now() - 86400000).toISOString(),
            },
          ],
        },
        {
          checksum: 'def456abc123def456abc123def456abc123def456abc123def456abc123def4',
          totalWastedBytes: 51200,
          files: [
            {
              id: 'file-003',
              originalFilename: 'notes.txt',
              fileSize: 51200,
              sourceId: 'src-001',
              createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
            },
            {
              id: 'file-004',
              originalFilename: 'notes.txt',
              fileSize: 51200,
              sourceId: 'src-002',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        {
          checksum: 'ccc111aaa222ccc111aaa222ccc111aaa222ccc111aaa222ccc111aaa222ccc1',
          totalWastedBytes: 1048576 * 2,
          files: [
            {
              id: 'file-005',
              originalFilename: 'presentation.pptx',
              fileSize: 1048576,
              sourceId: 'src-001',
              createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
            },
            {
              id: 'file-006',
              originalFilename: 'presentation-backup.pptx',
              fileSize: 1048576,
              sourceId: 'src-002',
              createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
            },
            {
              id: 'file-007',
              originalFilename: 'presentation-v2.pptx',
              fileSize: 1048576,
              sourceId: 'src-001',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
    };
  },

  deleteFile: async (_fileId: string): Promise<void> => {
    await new Promise((r) => setTimeout(r, 200));
  },
};

// ===========================================================================
// Export
// ===========================================================================

const USE_MOCK =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_MOCK === 'true';

/**
 * Duplicates API client.
 *
 * Use `duplicatesApi.list()` to fetch duplicate groups and
 * `duplicatesApi.deleteFile(id)` to delete a single duplicate.
 */
export const duplicatesApi = USE_MOCK ? _mockDuplicatesApi : _realDuplicatesApi;
