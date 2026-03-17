/**
 * Base API client with error handling using Axios
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { parseErrorResponse } from '@/lib/errors';

// Generate UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RequestOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: Record<string, any>;
  timeout?: number;
  headers?: Record<string, string>;
  data?: unknown;
}

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: ApiClientConfig = {}) {
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    this.axiosInstance = axios.create({
      baseURL: config.baseURL || '/api',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // Request interceptor for adding request ID and logging
    this.axiosInstance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        // Add unique request ID for tracing
        const requestId = generateUUID();
        config.headers['X-Request-ID'] = requestId;
        
        // Log request for debugging (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[${requestId}] ${config.method?.toUpperCase()} ${config.url}`, {
            params: config.params,
            data: config.data,
          });
        }
        
        return config;
      },
      (error) => {
        console.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and retry logic
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Log response for debugging (only in development)
        if (process.env.NODE_ENV === 'development') {
          const requestId = response.config.headers?.['X-Request-ID'];
          console.log(`[${requestId}] Response ${response.status}`, {
            data: response.data,
          });
        }
        return response;
      },
      async (error: AxiosError) => {
        const requestId = error.config?.headers?.['X-Request-ID'] as string;
        
        // Handle network errors and server errors with retry
        if (this.shouldRetry(error)) {
          const retryCount = ((error.config as any)?._retryCount || 0) as number;
          
          if (retryCount < this.maxRetries) {
            (error.config as any)._retryCount = retryCount + 1;
            
            if (process.env.NODE_ENV === 'development') {
              console.warn(
                `[${requestId}] Retrying request (${retryCount + 1}/${this.maxRetries})`,
                {
                  error: error.message,
                  status: error.response?.status,
                }
              );
            }
            
            // Wait before retrying with exponential backoff
            await this.sleep(this.retryDelay * Math.pow(2, retryCount));
            
            return this.axiosInstance.request(error.config!);
          }
        }
        
        // Log error for debugging
        if (process.env.NODE_ENV === 'development') {
          console.error(`[${requestId}] API Error:`, {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
          });
        }
        
        // Transform axios error to our custom error
        const parsedError = parseErrorResponse(error);
        return Promise.reject(parsedError);
      }
    );
  }

  /**
   * Check if the request should be retried
   */
  private shouldRetry(error: AxiosError): boolean {
    // Retry on network errors
    if (!error.response) {
      return true;
    }
    
    // Retry on 502, 503, 504 errors
    const status = error.response.status;
    return status === 502 || status === 503 || status === 504;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const config: AxiosRequestConfig = {
      params: options.params,
      timeout: options.timeout,
      headers: options.headers,
    };

    const response = await this.axiosInstance.get<T>(endpoint, config);
    return response.data;
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      params: options.params,
      timeout: options.timeout,
      headers: options.headers,
    };

    const response = await this.axiosInstance.post<T>(endpoint, body, config);
    return response.data;
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      params: options.params,
      timeout: options.timeout,
      headers: options.headers,
    };

    const response = await this.axiosInstance.put<T>(endpoint, body, config);
    return response.data;
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const config: AxiosRequestConfig = {
      params: options.params,
      timeout: options.timeout,
      headers: options.headers,
      data: options.data,
    };

    const response = await this.axiosInstance.delete<T>(endpoint, config);
    return response.data;
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      params: options.params,
      timeout: options.timeout,
      headers: options.headers,
    };

    const response = await this.axiosInstance.patch<T>(endpoint, body, config);
    return response.data;
  }

  /**
   * Get the underlying axios instance for advanced usage
   */
  getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}

// Default API client instance
export const apiClient = new ApiClient();
