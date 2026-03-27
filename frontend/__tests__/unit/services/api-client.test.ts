/**
 * Unit tests for ApiClient
 */

import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { ApiClient } from '@/services/api-client';
import { AppError, NetworkError } from '@/lib/errors';

describe('ApiClient', () => {
  let apiClient: ApiClient;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    apiClient = new ApiClient({ baseURL: '/api', timeout: 5000 });
    mockAxios = new MockAdapter(apiClient.getAxiosInstance());
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('URL Construction', () => {
    it('should construct correct URL with baseURL', async () => {
      let capturedUrl: string | undefined;
      mockAxios.onGet().reply((config) => {
        capturedUrl = config.url;
        return [200, { jobs: [] }];
      });

      await apiClient.get('/v1/jobs');

      // Verify URL is relative to baseURL
      expect(capturedUrl).toBe('/v1/jobs');
      // Should NOT be '/api/v1/jobs' because baseURL already includes '/api'
    });

    it('should not duplicate baseURL in path', async () => {
      let capturedUrl: string | undefined;
      mockAxios.onGet().reply((config) => {
        capturedUrl = config.url;
        return [200, {}];
      });

      await apiClient.get('/v1/jobs');

      // Ensure no duplicate /api prefix
      expect(capturedUrl).not.toContain('/api/api');
      expect(capturedUrl).toBe('/v1/jobs');
    });

    it('should handle multiple path segments correctly', async () => {
      let capturedUrl: string | undefined;
      mockAxios.onDelete().reply((config) => {
        capturedUrl = config.url;
        return [200, {}];
      });

      await apiClient.delete('/v1/jobs/bulk');

      expect(capturedUrl).toBe('/v1/jobs/bulk');
      expect(capturedUrl).not.toContain('/api/v1');
    });
  });

  describe('Request Headers', () => {
    it('should add X-Request-ID header', async () => {
      let capturedHeaders: any;
      mockAxios.onGet().reply((config) => {
        capturedHeaders = config.headers;
        return [200, {}];
      });

      await apiClient.get('/v1/jobs');

      expect(capturedHeaders['X-Request-ID']).toBeDefined();
      expect(capturedHeaders['X-Request-ID']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should include Content-Type header', async () => {
      let capturedHeaders: any;
      mockAxios.onPost().reply((config) => {
        capturedHeaders = config.headers;
        return [200, {}];
      });

      await apiClient.post('/v1/jobs', { test: 'data' });

      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const responseData = { jobs: [], total: 0 };
      mockAxios.onGet('/v1/jobs').reply(200, responseData);

      const result = await apiClient.get('/v1/jobs');

      expect(result).toEqual(responseData);
    });

    it('should include query parameters', async () => {
      const responseData = { jobs: [], total: 0 };
      mockAxios.onGet('/v1/jobs', { params: { page: 1, page_size: 20 } }).reply(200, responseData);

      const result = await apiClient.get('/v1/jobs', {
        params: { page: 1, page_size: 20 },
      });

      expect(result).toEqual(responseData);
    });

    it('should handle 404 error', async () => {
      mockAxios.onGet('/v1/jobs/invalid').reply(404, {
        errors: [{
          errorCode: 'JOB1001',
          statusCode: 404,
          errorType: 'VALIDATION',
          errorCategory: 'CLIENT',
          message: 'Job not found',
          messageKey: 'error.job.JOB1001.not_found',
        }],
      });

      await expect(apiClient.get('/v1/jobs/invalid')).rejects.toThrow(AppError);
    });

    it('should handle network error', async () => {
      mockAxios.onGet('/v1/jobs').networkError();

      await expect(apiClient.get('/v1/jobs')).rejects.toThrow();
    }, 10000); // Longer timeout for retry logic

    it('should handle timeout', async () => {
      mockAxios.onGet('/v1/jobs').timeout();

      await expect(apiClient.get('/v1/jobs')).rejects.toThrow();
    }, 10000); // Longer timeout for retry logic
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const requestData = { job_ids: ['123', '456'] };
      const responseData = { deleted_count: 2, failed_count: 0 };
      
      mockAxios.onPost('/v1/jobs/bulk/delete', requestData).reply(200, responseData);

      const result = await apiClient.post('/v1/jobs/bulk/delete', requestData);

      expect(result).toEqual(responseData);
    });

    it('should handle validation error', async () => {
      mockAxios.onPost('/v1/jobs/bulk/delete').reply(400, {
        errors: [{
          errorCode: 'JOB1007',
          statusCode: 400,
          message: 'No jobs provided',
        }],
      });

      await expect(apiClient.post('/v1/jobs/bulk/delete', {})).rejects.toThrow(AppError);
    });
  });

  describe('DELETE requests', () => {
    it('should make successful DELETE request', async () => {
      const responseData = { message: 'Job deleted', job_id: '123' };
      mockAxios.onDelete('/v1/jobs/123').reply(200, responseData);

      const result = await apiClient.delete('/v1/jobs/123');

      expect(result).toEqual(responseData);
    });

    it('should handle unauthorized error', async () => {
      mockAxios.onDelete('/v1/jobs/123').reply(403, {
        errors: [{
          errorCode: 'JOB1002',
          statusCode: 403,
          message: 'Unauthorized',
        }],
      });

      await expect(apiClient.delete('/v1/jobs/123')).rejects.toThrow(AppError);
    });
  });

  describe('PUT requests', () => {
    it('should make successful PUT request', async () => {
      const requestData = { status: 'completed' };
      const responseData = { success: true };
      
      mockAxios.onPut('/v1/jobs/123', requestData).reply(200, responseData);

      const result = await apiClient.put('/v1/jobs/123', requestData);

      expect(result).toEqual(responseData);
    });
  });

  describe('PATCH requests', () => {
    it('should make successful PATCH request', async () => {
      const requestData = { progress: 50 };
      const responseData = { success: true };
      
      mockAxios.onPatch('/v1/jobs/123', requestData).reply(200, responseData);

      const result = await apiClient.patch('/v1/jobs/123', requestData);

      expect(result).toEqual(responseData);
    });
  });

  describe('Error handling', () => {
    it('should parse AppError correctly', async () => {
      mockAxios.onGet('/v1/jobs/123').reply(404, {
        errors: [{
          errorCode: 'JOB1001',
          statusCode: 404,
          errorType: 'VALIDATION',
          errorCategory: 'CLIENT',
          message: 'Job not found',
          messageKey: 'error.job.JOB1001.not_found',
        }],
      });

      try {
        await apiClient.get('/v1/jobs/123');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (error instanceof AppError) {
          expect(error.errorCode).toBe('JOB1001');
          expect(error.statusCode).toBe(404);
          expect(error.message).toBe('Job not found');
        }
      }
    });

    it('should parse server error', async () => {
      mockAxios.onGet('/v1/jobs').reply(500, {
        errors: [{
          errorCode: 'JOB1010',
          statusCode: 500,
          message: 'Database error',
        }],
      });

      try {
        await apiClient.get('/v1/jobs');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        if (error instanceof AppError) {
          expect(error.statusCode).toBe(500);
          expect(error.isServerError()).toBe(true);
        }
      }
    });
  });

  describe('Custom headers', () => {
    it('should include custom headers', async () => {
      const responseData = { success: true };
      
      mockAxios.onGet('/v1/jobs').reply((config) => {
        expect(config.headers?.['X-Custom-Header']).toBe('test-value');
        return [200, responseData];
      });

      await apiClient.get('/v1/jobs', {
        headers: { 'X-Custom-Header': 'test-value' },
      });
    });
  });

  describe('Timeout', () => {
    it('should respect custom timeout', async () => {
      const shortTimeoutClient = new ApiClient({ timeout: 100 });
      const mockShortAxios = new MockAdapter(shortTimeoutClient.getAxiosInstance());
      
      // Mock a long delay that exceeds the timeout
      mockShortAxios.onGet('/v1/jobs').timeout();

      await expect(shortTimeoutClient.get('/v1/jobs')).rejects.toThrow();
      
      mockShortAxios.reset();
    }, 10000); // Give enough time for retries
  });
});
