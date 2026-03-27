/**
 * Unit tests specifically for URL construction
 * These tests prevent duplicate prefix bugs
 */

import { ApiClient } from '@/services/api-client';
import MockAdapter from 'axios-mock-adapter';
import {
  assertNoDuplicatePrefix,
  assertUrlStructure,
  assertRequestHeaders,
  assertUUIDFormat,
  verifyApiClientConfig,
} from '../utils/test-helpers';

describe('URL Construction Tests', () => {
  describe('ApiClient baseURL handling', () => {
    it('should construct correct URL with baseURL', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('/v1/jobs');

      expect(capturedUrl).toBe('/v1/jobs');
      assertNoDuplicatePrefix(capturedUrl);
    });

    it('should not duplicate baseURL in endpoint', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      // Even if someone accidentally uses /api in endpoint
      await client.get('/v1/jobs');

      expect(capturedUrl).not.toContain('/api/api');
      assertNoDuplicatePrefix(capturedUrl);
    });

    it('should handle full URL baseURL correctly', async () => {
      const client = new ApiClient({ baseURL: 'http://localhost:8000/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('/v1/jobs');

      expect(capturedUrl).toBe('/v1/jobs');
      assertNoDuplicatePrefix(capturedUrl);
    });

    it('should verify baseURL + endpoint combination', () => {
      verifyApiClientConfig({
        baseURL: '/api',
        endpoint: '/v1/jobs',
        expectedFullUrl: '/api/v1/jobs',
      });

      // This should NOT happen
      expect(() => {
        verifyApiClientConfig({
          baseURL: '/api',
          endpoint: '/api/v1/jobs',
          expectedFullUrl: '/api/v1/jobs',
        });
      }).toThrow();
    });
  });

  describe('Request URL structure', () => {
    it('should construct correct URL for GET requests', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('/v1/jobs', { params: { page: 1, page_size: 20 } });

      assertUrlStructure(capturedUrl, {
        path: '/v1/jobs',
      });
    });

    it('should construct correct URL for DELETE requests', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onDelete().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.delete('/v1/jobs/123');

      expect(capturedUrl).toBe('/v1/jobs/123');
      assertNoDuplicatePrefix(capturedUrl);
    });

    it('should construct correct URL for POST requests', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onPost().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.post('/v1/jobs/123/cancel', {});

      expect(capturedUrl).toBe('/v1/jobs/123/cancel');
      assertNoDuplicatePrefix(capturedUrl);
    });
  });

  describe('Request headers', () => {
    it('should include X-Request-ID in all requests', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedHeaders: Record<string, string> = {};
      mock.onGet().reply(config => {
        capturedHeaders = config.headers || {};
        return [200, {}];
      });

      await client.get('/v1/jobs');

      assertRequestHeaders(capturedHeaders, ['X-Request-ID']);
      assertUUIDFormat(capturedHeaders['X-Request-ID']);
    });

    it('should include Content-Type for POST requests', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedHeaders: Record<string, string> = {};
      mock.onPost().reply(config => {
        capturedHeaders = config.headers || {};
        return [200, {}];
      });

      await client.post('/v1/jobs', { test: 'data' });

      assertRequestHeaders(capturedHeaders, ['Content-Type', 'X-Request-ID']);
      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });
  });

  describe('Multiple endpoints verification', () => {
    const endpoints = [
      { method: 'get', path: '/v1/jobs' },
      { method: 'get', path: '/v1/jobs/123' },
      { method: 'post', path: '/v1/jobs' },
      { method: 'put', path: '/v1/jobs/123' },
      { method: 'patch', path: '/v1/jobs/123' },
      { method: 'delete', path: '/v1/jobs/123' },
      { method: 'delete', path: '/v1/jobs/bulk' },
      { method: 'post', path: '/v1/jobs/123/cancel' },
      { method: 'get', path: '/v1/transcriptions' },
      { method: 'get', path: '/v1/transcriptions/456' },
    ];

    endpoints.forEach(({ method, path }) => {
      it(`should construct correct URL for ${method.toUpperCase()} ${path}`, async () => {
        const client = new ApiClient({ baseURL: '/api' });
        const mock = new MockAdapter(client.getAxiosInstance());
        
        let capturedUrl: string = '';
        
        // Setup mock based on method
        const mockMethod = mock[`on${method.charAt(0).toUpperCase() + method.slice(1)}` as keyof MockAdapter] as any;
        mockMethod.call(mock).reply((config: any) => {
          capturedUrl = config.url || '';
          return [200, {}];
        });

        // Make request based on method
        await (client as any)[method](path, method !== 'get' && method !== 'delete' ? {} : undefined);

        expect(capturedUrl).toBe(path);
        assertNoDuplicatePrefix(capturedUrl);
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle endpoint with leading slash', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('/v1/jobs');

      expect(capturedUrl).toBe('/v1/jobs');
      expect(capturedUrl).not.toContain('//');
    });

    it('should handle endpoint without leading slash', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('v1/jobs');

      expect(capturedUrl).toBe('v1/jobs');
    });

    it('should handle baseURL with trailing slash', async () => {
      const client = new ApiClient({ baseURL: '/api/' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('v1/jobs');

      expect(capturedUrl).toBe('v1/jobs');
      assertNoDuplicatePrefix(capturedUrl);
    });

    it('should handle complex path with multiple segments', async () => {
      const client = new ApiClient({ baseURL: '/api' });
      const mock = new MockAdapter(client.getAxiosInstance());
      
      let capturedUrl: string = '';
      mock.onGet().reply(config => {
        capturedUrl = config.url || '';
        return [200, {}];
      });

      await client.get('/v1/jobs/123/transcription/456/download');

      expect(capturedUrl).toBe('/v1/jobs/123/transcription/456/download');
      assertNoDuplicatePrefix(capturedUrl);
    });
  });
});
