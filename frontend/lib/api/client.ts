/**
 * KMS API Client
 *
 * Axios-based HTTP client with:
 * - JWT Bearer token injection
 * - Auto-refresh on 401 (calls /auth/refresh then retries original request)
 * - Typed error normalisation via ApiError
 * - Request/response interceptors
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  'http://localhost:8000';

const API_VERSION = '/api/v1';

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export interface ApiErrorPayload {
  code?: string;
  message?: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * ApiError — thrown by the client on any non-2xx response.
 *
 * Properties:
 * - `statusCode` — HTTP status code
 * - `code` — KB error code (e.g. "KBAUT0001"), if provided by backend
 * - `message` — human-readable error message
 * - `details` — optional extra context
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(payload: ApiErrorPayload, statusCode: number) {
    super(payload.message ?? `API error ${statusCode}`);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = payload.code ?? `HTTP_${statusCode}`;
    this.details = payload.details ?? null;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

// ---------------------------------------------------------------------------
// Token provider interface
// ---------------------------------------------------------------------------

/**
 * TokenProvider — injected into the client so it can resolve the current
 * access token and refresh callback without importing store modules directly
 * (avoids circular dependencies).
 */
export interface TokenProvider {
  /** Returns the current in-memory access token, or null if not authenticated. */
  getAccessToken: () => string | null;
  /** Called by the client after a successful token refresh. */
  setAccessToken: (token: string) => void;
  /** Called when refresh fails (forces logout). */
  onAuthFailure: () => void;
}

// ---------------------------------------------------------------------------
// Client class
// ---------------------------------------------------------------------------

export class KmsApiClient {
  private readonly http: AxiosInstance;
  private tokenProvider: TokenProvider | null = null;
  /** Prevents concurrent refresh attempts */
  private isRefreshing = false;
  /** Queue of requests that failed with 401 while a refresh was in progress */
  private refreshQueue: Array<{
    resolve: (token: string) => void;
    reject: (err: unknown) => void;
  }> = [];

  constructor() {
    this.http = axios.create({
      baseURL: `${BASE_URL}${API_VERSION}`,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    this.http.interceptors.request.use(this.requestInterceptor.bind(this));
    this.http.interceptors.response.use(
      this.responseSuccessInterceptor.bind(this),
      this.responseErrorInterceptor.bind(this),
    );
  }

  // -------------------------------------------------------------------------
  // Token provider injection
  // -------------------------------------------------------------------------

  /**
   * setTokenProvider — call this once from the auth store or a bootstrap
   * component so the client can read/write tokens.
   */
  setTokenProvider(provider: TokenProvider): void {
    this.tokenProvider = provider;
  }

  // -------------------------------------------------------------------------
  // Interceptors
  // -------------------------------------------------------------------------

  private requestInterceptor(
    config: InternalAxiosRequestConfig,
  ): InternalAxiosRequestConfig {
    const token = this.tokenProvider?.getAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }

  private responseSuccessInterceptor(response: AxiosResponse): AxiosResponse {
    return response;
  }

  private async responseErrorInterceptor(error: AxiosError): Promise<never> {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // Normalise error payload
    const status = error.response?.status ?? 0;
    const data = (error.response?.data ?? {}) as ApiErrorPayload;

    // 401 handling — attempt token refresh once
    if (status === 401 && !originalRequest._retried && this.tokenProvider) {
      originalRequest._retried = true;

      if (this.isRefreshing) {
        // Another refresh already in flight — queue this request
        return new Promise<string>((resolve, reject) => {
          this.refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return this.http(originalRequest) as Promise<never>;
        });
      }

      this.isRefreshing = true;

      try {
        const refreshed = await this.refresh();
        this.tokenProvider.setAccessToken(refreshed);
        // Flush queued requests
        this.refreshQueue.forEach(({ resolve }) => resolve(refreshed));
        this.refreshQueue = [];
        this.isRefreshing = false;

        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${refreshed}`;
        return this.http(originalRequest) as Promise<never>;
      } catch (refreshErr) {
        this.refreshQueue.forEach(({ reject }) => reject(refreshErr));
        this.refreshQueue = [];
        this.isRefreshing = false;
        this.tokenProvider.onAuthFailure();
        throw new ApiError({ message: 'Session expired. Please log in again.' }, 401);
      }
    }

    throw new ApiError(data, status);
  }

  // -------------------------------------------------------------------------
  // Internal: refresh token via httpOnly cookie
  // -------------------------------------------------------------------------

  private async refresh(): Promise<string> {
    // The refresh token lives in localStorage (kms_refresh_token)
    const refreshToken =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('kms_refresh_token')
        : null;
    if (!refreshToken) throw new Error('No refresh token available');

    // Backend expects { refreshToken } in the body and returns { accessToken, refreshToken, ... }
    const response = await axios.post<{
      accessToken: string;
      refreshToken: string;
    }>(`${BASE_URL}${API_VERSION}/auth/refresh`, { refreshToken });

    // Persist the rotated refresh token
    if (typeof localStorage !== 'undefined' && response.data.refreshToken) {
      localStorage.setItem('kms_refresh_token', response.data.refreshToken);
    }

    return response.data.accessToken;
  }

  // -------------------------------------------------------------------------
  // Public request helpers
  // -------------------------------------------------------------------------

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.get<T>(url, config);
    return res.data;
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const res = await this.http.post<T>(url, data, config);
    return res.data;
  }

  async put<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const res = await this.http.put<T>(url, data, config);
    return res.data;
  }

  async patch<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const res = await this.http.patch<T>(url, data, config);
    return res.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await this.http.delete<T>(url, config);
    return res.data;
  }

  /** Upload a file using multipart/form-data */
  async upload<T>(
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const res = await this.http.post<T>(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

/** Shared API client — import this everywhere instead of creating new instances. */
export const apiClient = new KmsApiClient();
