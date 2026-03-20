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

/** Single entry in a source's scan history. */
export interface ScanHistoryItem {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string;
}

// ── Real implementations ────────────────────────────────────────────────────

const _realKmsSourcesApi = {
  list: (): Promise<KmsSource[]> => apiClient.get<KmsSource[]>('/sources'),
  get: (id: string): Promise<KmsSource> => apiClient.get<KmsSource>(`/sources/${id}`),
  disconnect: (id: string): Promise<void> => apiClient.delete<void>(`/sources/${id}`),
  initiateGoogleDrive: (userId: string): void => {
    const base =
      typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL
        : 'http://localhost:8000';
    window.location.href = `${base}/api/v1/sources/google-drive/oauth?userId=${encodeURIComponent(userId)}`;
  },
  triggerScan: (sourceId: string, scanType: 'FULL' | 'INCREMENTAL' = 'FULL'): Promise<{ id: string; status: string }> =>
    apiClient.post<{ id: string; status: string }>(`/sources/${sourceId}/scan`, { scanType }),
  getScanHistory: (sourceId: string): Promise<ScanHistoryItem[]> =>
    apiClient.get<ScanHistoryItem[]>(`/sources/${sourceId}/scan-history`),
};

const _realLocalSourcesApi = {
  registerObsidian: (vaultPath: string, displayName?: string): Promise<KmsSource> =>
    apiClient.post<KmsSource>('/sources/obsidian', { vaultPath, displayName }),
  registerLocal: (path: string, displayName?: string): Promise<KmsSource> =>
    apiClient.post<KmsSource>('/sources/local', { path, displayName }),
};

// ── Mock swap ───────────────────────────────────────────────────────────────
// To use real API: remove NEXT_PUBLIC_USE_MOCK from .env.local (or set to false).

import { mockKmsSourcesApi, mockLocalSourcesApi } from '@/lib/mock/handlers/sources.mock';
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

/**
 * Typed API methods for the /sources resource.
 */
export const kmsSourcesApi = USE_MOCK ? mockKmsSourcesApi : _realKmsSourcesApi;

/**
 * Typed API methods for local and Obsidian sources.
 */
export const localSourcesApi = USE_MOCK ? mockLocalSourcesApi : _realLocalSourcesApi;
