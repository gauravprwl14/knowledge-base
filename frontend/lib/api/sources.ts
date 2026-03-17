import { apiClient } from './client';

/**
 * Source connection status — mirrors the backend SourceStatus enum.
 */
export type SourceStatus =
  | 'PENDING'
  | 'IDLE'
  | 'CONNECTED'
  | 'SCANNING'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ERROR'
  | 'DISCONNECTED'
  | 'PAUSED';

/**
 * Source type — mirrors the backend SourceType enum.
 */
export type SourceType = 'GOOGLE_DRIVE' | 'LOCAL' | 'OBSIDIAN';

/**
 * A knowledge source as returned by the API.
 * Sensitive token fields are never included.
 */
export interface KmsSource {
  id: string;
  userId: string;
  type: SourceType;
  status: SourceStatus;
  displayName: string | null;
  externalId?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
}

/**
 * Typed API methods for the /sources resource.
 */
export const kmsSourcesApi = {
  /**
   * GET /sources — returns all sources connected by the authenticated user.
   */
  list: (): Promise<KmsSource[]> => apiClient.get<KmsSource[]>('/sources'),

  /**
   * GET /sources/:id — returns a single source.
   */
  get: (id: string): Promise<KmsSource> => apiClient.get<KmsSource>(`/sources/${id}`),

  /**
   * DELETE /sources/:id — disconnects a source.
   */
  disconnect: (id: string): Promise<void> => apiClient.delete<void>(`/sources/${id}`),

  /**
   * Redirects the browser to the Google OAuth consent screen.
   * The backend embeds `userId` in the OAuth `state` param for callback association.
   *
   * @param userId - The authenticated user's UUID
   */
  initiateGoogleDrive: (userId: string): void => {
    const base =
      typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : 'http://localhost:8000';
    window.location.href = `${base}/api/v1/sources/google-drive/oauth?userId=${encodeURIComponent(userId)}`;
  },
};
