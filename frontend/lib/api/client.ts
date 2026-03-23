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

const BASE_URL = (() => {
  // Server-side (SSR/Node): use internal Docker URL or explicit env var
  if (typeof window === 'undefined') {
    return (
      process.env.KMS_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:8000'
    );
  }
  // Client-side (browser): use configured env var first
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // Auto-detect: strip trailing path segments, keep first path segment as base
  // e.g. https://rnd.blr0.geekydev.com/kms/sources → https://rnd.blr0.geekydev.com/kms
  const pathMatch = window.location.pathname.match(/^(\/[^/]+)/);
  if (pathMatch) {
    return window.location.origin + pathMatch[1];
  }
  return window.location.origin;
})();

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
  /**
   * Optional: returns the in-flight session-restore promise so the request
   * interceptor can await it before attaching the Bearer token. This prevents
   * a race where child components fire API calls before AuthProvider has
   * restored the access token from the refresh token in localStorage.
   */
  getAuthRestorePromise?: () => Promise<void> | null;
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

  private async requestInterceptor(
    config: InternalAxiosRequestConfig,
  ): Promise<InternalAxiosRequestConfig> {
    // Wait for session restore to finish (if in progress) before attaching
    // the Bearer token. Without this, child components that mount before
    // AuthProvider's useEffect runs will send requests with no token, receive
    // a 401, and trigger a second concurrent refresh — causing a JTI replay
    // error that destroys the session.
    const restorePromise = this.tokenProvider?.getAuthRestorePromise?.();
    if (restorePromise) {
      await restorePromise;
    }
    const token = this.tokenProvider?.getAccessToken();
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  }

  private responseSuccessInterceptor(response: AxiosResponse): AxiosResponse {
    // The NestJS TransformInterceptor wraps every response as:
    //   { success: true, data: <payload>, meta: {...}, timestamp: "..." }
    // Unwrap it here so callers receive the typed payload directly.
    if (
      response.data &&
      typeof response.data === 'object' &&
      response.data.success === true &&
      'data' in response.data
    ) {
      response.data = response.data.data;
    }
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

    // Backend expects { refreshToken } in the body.
    // Response is wrapped by NestJS TransformInterceptor:
    //   { success: true, data: { accessToken, refreshToken, ... } }
    // Use standalone axios (not this.http) to avoid triggering the 401 interceptor again.
    const response = await axios.post(`${BASE_URL}${API_VERSION}/auth/refresh`, {
      refreshToken,
    });
    const raw = response.data;
    const data = (
      raw?.success === true && raw?.data ? raw.data : raw
    ) as { accessToken: string; refreshToken: string };

    // Persist the rotated refresh token
    if (typeof localStorage !== 'undefined' && data.refreshToken) {
      localStorage.setItem('kms_refresh_token', data.refreshToken);
    }

    return data.accessToken;
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
