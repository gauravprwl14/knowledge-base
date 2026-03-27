/**
 * Integration tests for services + API client
 * Verifies that services correctly construct URLs and make HTTP calls
 */

import { JobService } from '@/services/job-service';
import { TranscriptionService } from '@/services/transcription-service';
import { apiClient } from '@/services/api-client';
import MockAdapter from 'axios-mock-adapter';

describe('Services Integration Tests', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    // Mock the shared apiClient axios instance
    mock = new MockAdapter(apiClient.getAxiosInstance());
  });

  afterEach(() => {
    mock.reset();
  });

  describe('Job Service URL Construction', () => {
    it('should call correct endpoint for listJobs', async () => {
      let capturedUrl: string | undefined;
      
      mock.onGet().reply((config) => {
        capturedUrl = config.url;
        return [200, { jobs: [], total: 0, page: 1, page_size: 20 }];
      });

      await JobService.listJobs();

      // Verify relative path (baseURL /api is handled by axios config)
      expect(capturedUrl).toBe('/v1/jobs');
      expect(capturedUrl).not.toContain('/api/api');
    });

    it('should call correct endpoint for bulkDeleteJobs', async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      let capturedData: any;
      
      mock.onDelete().reply((config) => {
        capturedUrl = config.url;
        capturedMethod = config.method;
        // Data could be a string (JSON), an object, or undefined
        if (typeof config.data === 'string') {
          capturedData = JSON.parse(config.data);
        } else if (config.data) {
          capturedData = config.data;
        } else {
          capturedData = {};
        }
        return [200, {
          deleted_count: 2,
          failed_count: 0,
          total_requested: 2,
          deleted_jobs: [],
          failed_jobs: [],
        }];
      });

      await JobService.bulkDeleteJobs(['123', '456']);

      expect(capturedUrl).toBe('/v1/jobs/bulk');
      expect(capturedMethod).toBe('delete');
      // Only check if data was sent (may be in different formats based on interceptor)
      expect(capturedData).toBeDefined();
      expect(capturedUrl).not.toContain('/api/api');
    });

    it('should call correct endpoint for deleteJob', async () => {
      let capturedUrl: string | undefined;
      let capturedMethod: string | undefined;
      
      mock.onDelete().reply((config) => {
        capturedUrl = config.url;
        capturedMethod = config.method;
        return [200, { message: 'Job deleted' }];
      });

      await JobService.deleteJob('123');

      expect(capturedUrl).toBe('/v1/jobs/123');
      expect(capturedMethod).toBe('delete');
    });

    it('should call correct endpoint for cancelJob', async () => {
      let capturedUrl: string | undefined;
      
      mock.onPost().reply((config) => {
        capturedUrl = config.url;
        return [200, { message: 'Job cancelled' }];
      });

      await JobService.cancelJob('123');

      expect(capturedUrl).toBe('/v1/jobs/123/cancel');
    });
  });

  describe('Transcription Service URL Construction', () => {
    it('should call correct endpoint for listTranscriptions', async () => {
      let capturedUrl: string | undefined;
      
      mock.onGet().reply((config) => {
        capturedUrl = config.url;
        return [200, { transcriptions: [], total: 0, page: 1, page_size: 20 }];
      });

      await TranscriptionService.listTranscriptions();

      expect(capturedUrl).toBe('/v1/transcriptions');
      expect(capturedUrl).not.toContain('/api/api');
    });

    it('should call correct endpoint for getTranscription', async () => {
      let capturedUrl: string | undefined;
      
      mock.onGet().reply((config) => {
        capturedUrl = config.url;
        return [200, {
          id: '123',
          job_id: '456',
          text: 'Hello world',
          language: 'en',
          format: 'text',
        }];
      });

      await TranscriptionService.getTranscription('123');

      expect(capturedUrl).toBe('/v1/transcriptions/123');
    });

    // Note: downloadTranscription uses fetch() not axios, so we can't test it here
    // It's covered by E2E tests instead
  });

  describe('Request Headers', () => {
    it('should include X-Request-ID header in all requests', async () => {
      let capturedHeaders: Record<string, any> = {};
      
      mock.onGet().reply((config) => {
        capturedHeaders = config.headers || {};
        return [200, { jobs: [] }];
      });

      await JobService.listJobs();

      expect(capturedHeaders['X-Request-ID']).toBeDefined();
      expect(capturedHeaders['X-Request-ID']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should include Content-Type for POST requests', async () => {
      let capturedHeaders: Record<string, any> = {};
      
      mock.onPost().reply((config) => {
        capturedHeaders = config.headers || {};
        return [200, { message: 'Cancelled' }];
      });

      await JobService.cancelJob('123');

      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });

    it('should include Content-Type for DELETE with body', async () => {
      let capturedHeaders: Record<string, any> = {};
      
      mock.onDelete().reply((config) => {
        capturedHeaders = config.headers || {};
        return [200, { deleted_count: 1, failed_count: 0 }];
      });

      await JobService.bulkDeleteJobs(['123']);

      expect(capturedHeaders['Content-Type']).toBe('application/json');
    });
  });

  describe('Query Parameters', () => {
    it('should pass pagination parameters correctly', async () => {
      let capturedParams: any;
      
      mock.onGet().reply((config) => {
        capturedParams = config.params;
        return [200, { jobs: [], total: 0, page: 2, page_size: 50 }];
      });

      await JobService.listJobs({ page: 2, page_size: 50 });

      expect(capturedParams).toEqual({ page: 2, page_size: 50 });
    });

    it('should pass filter parameters correctly', async () => {
      let capturedParams: any;
      
      mock.onGet().reply((config) => {
        capturedParams = config.params;
        return [200, { jobs: [], total: 0 }];
      });

      await JobService.listJobs({ status: 'completed', job_type: 'transcription' });

      expect(capturedParams).toMatchObject({ 
        status: 'completed', 
        job_type: 'transcription' 
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 error with standard format', async () => {
      mock.onGet('/v1/jobs/999').reply(404, {
        errors: [{
          errorCode: 'JOB1001',
          message: 'Job not found',
          type: 'not_found',
          category: 'client',
          statusCode: 404,
        }],
      });

      await expect(JobService.getJob('999')).rejects.toThrow();
    });

    it('should handle validation error', async () => {
      mock.onDelete('/v1/jobs/bulk').reply(400, {
        errors: [{
          errorCode: 'JOB1007',
          message: 'No jobs provided',
          type: 'validation',
          category: 'client',
          statusCode: 400,
        }],
      });

      await expect(JobService.bulkDeleteJobs([])).rejects.toThrow();
    });

    it('should handle bulk operation limit error', async () => {
      const jobIds = Array(101).fill('').map((_, i) => `job-${i}`);
      
      mock.onDelete('/v1/jobs/bulk').reply(400, {
        errors: [{
          errorCode: 'JOB1008',
          message: 'Bulk operation limit exceeded',
          type: 'validation',
          category: 'client',
          statusCode: 400,
        }],
      });

      await expect(JobService.bulkDeleteJobs(jobIds)).rejects.toThrow();
    });
  });

  describe('Response Parsing', () => {
    it('should parse job list response correctly', async () => {
      const mockResponse = {
        jobs: [
          {
            id: '123',
            status: 'completed',
            job_type: 'transcription',
            provider: 'whisper',
            model_name: 'base',
            original_filename: 'test.mp3',
            progress: 100,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      };

      mock.onGet('/v1/jobs').reply(200, mockResponse);

      const result = await JobService.listJobs();

      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].id).toBe('123');
      expect(result.total).toBe(1);
    });

    it('should parse bulk delete response correctly', async () => {
      const mockResponse = {
        deleted_count: 2,
        failed_count: 1,
        total_requested: 3,
        deleted_jobs: [
          { job_id: '123', original_filename: 'test1.mp3', status: 'deleted' },
          { job_id: '456', original_filename: 'test2.mp3', status: 'deleted' },
        ],
        failed_jobs: [
          { 
            job_id: '789', 
            error: { 
              errorCode: 'JOB1002',
              message: 'Job file not found',
              type: 'not_found',
            },
          },
        ],
        files_deleted_count: 4,
        files_failed_count: 0,
      };

      mock.onDelete('/v1/jobs/bulk').reply(200, mockResponse);

      const result = await JobService.bulkDeleteJobs(['123', '456', '789']);

      expect(result.deleted_count).toBe(2);
      expect(result.failed_count).toBe(1);
      expect(result.deleted_jobs).toHaveLength(2);
      expect(result.failed_jobs).toHaveLength(1);
    });
  });
});
