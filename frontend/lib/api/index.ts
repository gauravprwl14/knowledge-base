/**
 * KMS API Modules — typed API surface over the kms-api and search-api backends.
 *
 * Each module groups related endpoints. All methods return typed promises.
 * Errors are thrown as `ApiError` instances (see client.ts).
 *
 * Usage:
 *   import { authApi, sourcesApi, filesApi, searchApi, chatApi } from '@/lib/api';
 */

export { apiClient, ApiError } from './client';
export type { ApiErrorPayload, TokenProvider } from './client';

import { apiClient } from './client';

// ===========================================================================
// Shared pagination shape
// ===========================================================================

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ===========================================================================
// Auth API
// ===========================================================================

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: string[];
  avatarUrl?: string;
  createdAt: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export const authApi = {
  /**
   * POST /auth/login — returns access token (refresh token set in httpOnly cookie)
   */
  login: (credentials: LoginCredentials): Promise<AuthTokens> =>
    apiClient.post('/auth/login', credentials),

  /**
   * POST /auth/register — creates a new user account
   */
  register: (payload: RegisterPayload): Promise<UserProfile> =>
    apiClient.post('/auth/register', payload),

  /**
   * POST /auth/logout — invalidates the refresh token cookie
   */
  logout: (): Promise<void> =>
    apiClient.post('/auth/logout'),

  /**
   * GET /auth/me — returns the authenticated user's profile
   */
  getMe: (): Promise<UserProfile> =>
    apiClient.get('/auth/me'),
};

// ===========================================================================
// Sources API
// ===========================================================================

export type SourceType = 'local' | 'google_drive' | 'dropbox' | 'onedrive' | 's3';
export type SourceStatus = 'active' | 'syncing' | 'error' | 'paused';

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  status: SourceStatus;
  fileCount: number;
  lastSyncedAt: string | null;
  createdAt: string;
  config: Record<string, unknown>;
}

export interface CreateSourcePayload {
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
}

export const sourcesApi = {
  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<Source>> =>
    apiClient.get(`/sources?page=${page}&page_size=${pageSize}`),

  get: (id: string): Promise<Source> =>
    apiClient.get(`/sources/${id}`),

  create: (payload: CreateSourcePayload): Promise<Source> =>
    apiClient.post('/sources', payload),

  update: (id: string, payload: Partial<CreateSourcePayload>): Promise<Source> =>
    apiClient.patch(`/sources/${id}`, payload),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/sources/${id}`),

  /** Trigger a manual sync for a source */
  sync: (id: string): Promise<{ jobId: string }> =>
    apiClient.post(`/sources/${id}/sync`),
};

// ===========================================================================
// Files API
// ===========================================================================

export type FileStatus =
  | 'pending'
  | 'scanning'
  | 'embedding'
  | 'ready'
  | 'error'
  | 'duplicate'
  | 'junk';

export interface KmsFile {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  status: FileStatus;
  sourceId: string;
  collectionId: string | null;
  isDuplicate: boolean;
  isJunk: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadFileOptions {
  collectionId?: string;
  sourceId?: string;
}

export const filesApi = {
  list: (
    page = 1,
    pageSize = 20,
    filters?: { status?: FileStatus; sourceId?: string },
  ): Promise<PaginatedResponse<KmsFile>> => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.sourceId) params.set('source_id', filters.sourceId);
    return apiClient.get(`/files?${params.toString()}`);
  },

  get: (id: string): Promise<KmsFile> =>
    apiClient.get(`/files/${id}`),

  upload: (file: File, options: UploadFileOptions = {}): Promise<KmsFile> => {
    const form = new FormData();
    form.append('file', file);
    if (options.collectionId) form.append('collection_id', options.collectionId);
    if (options.sourceId) form.append('source_id', options.sourceId);
    return apiClient.upload('/files', form);
  },

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/files/${id}`),

  markJunk: (id: string): Promise<KmsFile> =>
    apiClient.patch(`/files/${id}/junk`),

  restore: (id: string): Promise<KmsFile> =>
    apiClient.patch(`/files/${id}/restore`),
};

// ===========================================================================
// Search API  (search-api service on port 8001, same base URL via gateway)
// ===========================================================================

export type SearchMode = 'hybrid' | 'semantic' | 'keyword';

export interface SearchRequest {
  query: string;
  mode?: SearchMode;
  sourceIds?: string[];
  collectionIds?: string[];
  fileTypes?: string[];
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  id: string;
  fileId: string;
  fileName: string;
  snippet: string;
  score: number;
  highlights: string[];
  sourceId: string;
  mimeType: string;
  createdAt: string;
}

export const searchApi = {
  search: (req: SearchRequest): Promise<PaginatedResponse<SearchResult>> =>
    apiClient.post('/search', req),

  suggest: (query: string): Promise<{ suggestions: string[] }> =>
    apiClient.get(`/search/suggest?q=${encodeURIComponent(query)}`),
};

// ===========================================================================
// Chat / RAG API  (rag-service on port 8002, proxied via gateway)
// ===========================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessagePayload {
  sessionId: string;
  message: string;
  /** If true, caller handles EventSource streaming — do not use this method */
  stream?: false;
}

export const chatApi = {
  /** List all chat sessions for the current user */
  listSessions: (page = 1, pageSize = 20): Promise<PaginatedResponse<ChatSession>> =>
    apiClient.get(`/chat/sessions?page=${page}&page_size=${pageSize}`),

  /** Create a new chat session */
  createSession: (payload: {
    title?: string;
    collectionId?: string;
  }): Promise<ChatSession> =>
    apiClient.post('/chat/sessions', payload),

  /** Get a single session with its message history */
  getSession: (id: string): Promise<ChatSession> =>
    apiClient.get(`/chat/sessions/${id}`),

  /** Delete a session */
  deleteSession: (id: string): Promise<void> =>
    apiClient.delete(`/chat/sessions/${id}`),

  /**
   * Send a message (non-streaming).
   * For SSE streaming, construct an EventSource directly in the component.
   */
  sendMessage: (payload: SendMessagePayload): Promise<ChatMessage> =>
    apiClient.post('/chat/message', payload),
};

// ===========================================================================
// Collections API
// ===========================================================================

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollectionPayload {
  name: string;
  description?: string;
}

export const collectionsApi = {
  list: (page = 1, pageSize = 20): Promise<PaginatedResponse<Collection>> =>
    apiClient.get(`/collections?page=${page}&page_size=${pageSize}`),

  get: (id: string): Promise<Collection> =>
    apiClient.get(`/collections/${id}`),

  create: (payload: CreateCollectionPayload): Promise<Collection> =>
    apiClient.post('/collections', payload),

  update: (id: string, payload: Partial<CreateCollectionPayload>): Promise<Collection> =>
    apiClient.patch(`/collections/${id}`, payload),

  delete: (id: string): Promise<void> =>
    apiClient.delete(`/collections/${id}`),
};
