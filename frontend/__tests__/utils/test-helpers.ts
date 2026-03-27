/**
 * Test utilities for API testing
 * Provides helpers to verify URL construction and request details
 */

import MockAdapter from 'axios-mock-adapter';
import { AxiosInstance } from 'axios';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
}

/**
 * Create a mock adapter that captures request details
 */
export function createCapturingMock(axiosInstance: AxiosInstance) {
  const mock = new MockAdapter(axiosInstance);
  const capturedRequests: CapturedRequest[] = [];

  // Override reply methods to capture requests
  const originalOnAny = mock.onAny.bind(mock);
  
  mock.onAny = function(url?: string | RegExp, body?: any) {
    const handler = originalOnAny(url, body);
    
    // Wrap reply to capture request details
    const originalReply = handler.reply.bind(handler);
    handler.reply = function(statusOrCallback: any, data?: any, headers?: any) {
      if (typeof statusOrCallback === 'function') {
        return originalReply((config: any) => {
          capturedRequests.push({
            url: config.url || '',
            method: config.method?.toUpperCase() || 'GET',
            headers: config.headers || {},
            params: config.params,
            data: config.data,
          });
          return statusOrCallback(config);
        });
      }
      
      return originalReply(statusOrCallback, data, headers);
    };
    
    return handler;
  };

  return {
    mock,
    capturedRequests,
    getLastRequest: () => capturedRequests[capturedRequests.length - 1],
    clearRequests: () => capturedRequests.splice(0, capturedRequests.length),
  };
}

/**
 * Assert that URL does not have duplicate prefixes
 */
export function assertNoDuplicatePrefix(url: string, prefix: string = '/api') {
  const duplicatePattern = new RegExp(`${prefix}${prefix}`, 'g');
  expect(url).not.toMatch(duplicatePattern);
}

/**
 * Assert that URL has correct structure
 */
export function assertUrlStructure(
  url: string,
  expected: {
    baseURL?: string;
    path: string;
    params?: Record<string, string>;
  }
) {
  const urlObj = new URL(url, 'http://localhost');
  
  // Check path
  expect(urlObj.pathname).toBe(expected.path);
  
  // Check base URL if provided
  if (expected.baseURL) {
    expect(url).toContain(expected.baseURL);
  }
  
  // Check query params if provided
  if (expected.params) {
    Object.entries(expected.params).forEach(([key, value]) => {
      expect(urlObj.searchParams.get(key)).toBe(value);
    });
  }
}

/**
 * Assert that request has required headers
 */
export function assertRequestHeaders(
  headers: Record<string, string>,
  required: string[]
) {
  required.forEach(header => {
    const headerLower = header.toLowerCase();
    const found = Object.keys(headers).some(
      h => h.toLowerCase() === headerLower
    );
    expect(found).toBe(true);
  });
}

/**
 * Assert UUID format
 */
export function assertUUIDFormat(value: string) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  expect(value).toMatch(uuidRegex);
}

/**
 * Create mock response for standard error format
 */
export function createErrorResponse(
  errorCode: string,
  message: string,
  statusCode: number = 400,
  data: Record<string, any> = {}
) {
  return {
    status: statusCode,
    data: {
      errors: [{
        errorCode,
        message,
        type: statusCode === 404 ? 'not_found' : 'validation_error',
        category: statusCode === 404 ? 'resource' : 'input_validation',
        data,
      }],
      meta: {
        timestamp: new Date().toISOString(),
        path: '/api/v1/test',
      },
    },
  };
}

/**
 * Wait for async operations
 */
export async function waitFor(ms: number = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verify API client configuration
 */
export function verifyApiClientConfig(config: {
  baseURL: string;
  endpoint: string;
  expectedFullUrl: string;
}) {
  const { baseURL, endpoint, expectedFullUrl } = config;
  
  // Remove trailing slash from baseURL
  const cleanBaseURL = baseURL.replace(/\/$/, '');
  
  // Remove leading slash from endpoint if baseURL ends with one
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  const constructedUrl = `${cleanBaseURL}${cleanEndpoint}`;
  
  expect(constructedUrl).toBe(expectedFullUrl);
}
