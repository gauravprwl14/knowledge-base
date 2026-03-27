import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** System-wide counters returned by GET /admin/stats */
export interface AdminStats {
  totalUsers: number;
  totalSources: number;
  totalFiles: number;
  pendingEmbeds: number;
  processingEmbeds: number;
  failedFiles: number;
}

/** Cursor-paginated envelope returned by all admin list endpoints. */
export interface AdminListResponse<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

/** A single user row from GET /admin/users */
export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

/** A single source row from GET /admin/sources */
export interface AdminSource {
  id: string;
  userId: string;
  userEmail: string | null;
  type: string;
  name: string;
  status: string;
  lastScannedAt: string | null;
  fileCount: number;
}

/** A single scan job row from GET /admin/scan-jobs */
export interface AdminScanJob {
  id: string;
  userId: string;
  userEmail: string | null;
  sourceId: string;
  sourceName: string | null;
  type: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  filesFound: number;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetches system-wide statistics.
 * Requires ADMIN role; throws ApiError (403) otherwise.
 */
export async function getAdminStats(): Promise<AdminStats> {
  return apiClient.get<AdminStats>('/admin/stats');
}

/**
 * Returns a cursor-paginated list of all users.
 * @param cursor - Optional cursor from previous page's `nextCursor`.
 * @param limit - Page size (1-100, defaults to 50).
 */
export async function getAdminUsers(
  cursor?: string,
  limit = 50,
): Promise<AdminListResponse<AdminUser>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return apiClient.get<AdminListResponse<AdminUser>>(`/admin/users?${params}`);
}

/**
 * Returns a cursor-paginated list of all sources.
 * @param cursor - Optional cursor from previous page's `nextCursor`.
 * @param limit - Page size (1-100, defaults to 50).
 */
export async function getAdminSources(
  cursor?: string,
  limit = 50,
): Promise<AdminListResponse<AdminSource>> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return apiClient.get<AdminListResponse<AdminSource>>(`/admin/sources?${params}`);
}

/**
 * Returns the most recent 200 scan jobs across all users.
 */
export async function getAdminScanJobs(): Promise<AdminListResponse<AdminScanJob>> {
  return apiClient.get<AdminListResponse<AdminScanJob>>('/admin/scan-jobs');
}
