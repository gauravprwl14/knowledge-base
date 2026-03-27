/**
 * Unit tests for JobService
 */

import MockAdapter from 'axios-mock-adapter';
import { JobService } from '@/services/job-service';
import { apiClient } from '@/services/api-client';
import { AppError } from '@/lib/errors';

describe('JobService', () => {
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockAxios = new MockAdapter(apiClient.getAxiosInstance());
  });

  afterEach(() => {
    mockAxios.reset();
  });

  describe('listJobs', () => {
    it('should fetch list of jobs', async () => {
      const responseData = {
        jobs: [
          {
            id: '123',
            status: 'completed',
            original_filename: 'test.mp3',
            provider: 'whisper',
            model_name: 'base',
            progress: 100,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      };

      mockAxios.onGet('/v1/jobs').reply(200, responseData);

      const result = await JobService.listJobs();

      expect(result).toEqual(responseData);
      expect(result.jobs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should include pagination parameters', async () => {
      mockAxios.onGet('/v1/jobs', { params: { page: 2, page_size: 10 } })
        .reply(200, { jobs: [], total: 0, page: 2, page_size: 10 });

      const result = await JobService.listJobs({ page: 2, page_size: 10 });

      expect(result.page).toBe(2);
      expect(result.page_size).toBe(10);
    });

    it('should filter by status', async () => {
      mockAxios.onGet('/v1/jobs', { params: { status: 'completed' } })
        .reply(200, { jobs: [], total: 0, page: 1, page_size: 20 });

      await JobService.listJobs({ status: 'completed' });

      expect(mockAxios.history.get[0].params).toEqual({ status: 'completed' });
    });
  });

  describe('getJob', () => {
    it('should fetch a single job', async () => {
      const jobData = {
        id: '123',
        status: 'completed',
        original_filename: 'test.mp3',
        provider: 'whisper',
        model_name: 'base',
        progress: 100,
        created_at: '2024-01-01T00:00:00Z',
      };

      mockAxios.onGet('/v1/jobs/123').reply(200, jobData);

      const result = await JobService.getJob('123');

      expect(result).toEqual(jobData);
      expect(result.id).toBe('123');
    });

    it('should throw error for non-existent job', async () => {
      mockAxios.onGet('/v1/jobs/invalid').reply(404, {
        errors: [{
          errorCode: 'JOB1001',
          message: 'Job not found',
          statusCode: 404,
        }],
      });

      await expect(JobService.getJob('invalid')).rejects.toThrow(AppError);
    });
  });

  describe('deleteJob', () => {
    it('should delete a job', async () => {
      const responseData = {
        message: 'Job deleted successfully',
        job_id: '123',
        original_filename: 'test.mp3',
        status: 'deleted',
        files_deleted: ['/tmp/test.mp3'],
        files_failed: [],
      };

      mockAxios.onDelete('/v1/jobs/123').reply(200, responseData);

      const result = await JobService.deleteJob('123');

      expect(result.job_id).toBe('123');
      expect(result.status).toBe('deleted');
      expect(result.files_deleted).toHaveLength(1);
    });

    it('should handle deletion error', async () => {
      mockAxios.onDelete('/v1/jobs/123').reply(403, {
        errors: [{
          errorCode: 'JOB1002',
          message: 'Unauthorized',
          statusCode: 403,
        }],
      });

      await expect(JobService.deleteJob('123')).rejects.toThrow(AppError);
    });
  });

  describe('bulkDeleteJobs', () => {
    it('should bulk delete jobs successfully', async () => {
      const jobIds = ['123', '456', '789'];
      const responseData = {
        deleted_count: 3,
        failed_count: 0,
        total_requested: 3,
        deleted_jobs: jobIds.map((id) => ({
          job_id: id,
          original_filename: `test_${id}.mp3`,
          status: 'deleted',
        })),
        failed_jobs: [],
        files_deleted_count: 6,
        files_failed_count: 0,
      };

      mockAxios.onDelete('/v1/jobs/bulk').reply(200, responseData);

      const result = await JobService.bulkDeleteJobs(jobIds);

      expect(result.deleted_count).toBe(3);
      expect(result.failed_count).toBe(0);
      expect(result.deleted_jobs).toHaveLength(3);
    });

    it('should handle partial success', async () => {
      const jobIds = ['123', '456', '789'];
      const responseData = {
        deleted_count: 2,
        failed_count: 1,
        total_requested: 3,
        deleted_jobs: [
          { job_id: '123', original_filename: 'test1.mp3', status: 'deleted' },
          { job_id: '456', original_filename: 'test2.mp3', status: 'deleted' },
        ],
        failed_jobs: [
          { job_id: '789', original_filename: 'test3.mp3', error: 'File not found' },
        ],
        files_deleted_count: 4,
        files_failed_count: 0,
      };

      mockAxios.onDelete('/v1/jobs/bulk').reply(200, responseData);

      const result = await JobService.bulkDeleteJobs(jobIds);

      expect(result.deleted_count).toBe(2);
      expect(result.failed_count).toBe(1);
      expect(result.failed_jobs).toHaveLength(1);
    });

    it('should handle empty job list error', async () => {
      mockAxios.onDelete('/v1/jobs/bulk').reply(400, {
        errors: [{
          errorCode: 'JOB1007',
          message: 'No jobs provided',
          statusCode: 400,
        }],
      });

      await expect(JobService.bulkDeleteJobs([])).rejects.toThrow(AppError);
    });

    it('should handle bulk limit exceeded', async () => {
      const jobIds = Array(101).fill('').map((_, i) => `job-${i}`);
      
      mockAxios.onDelete('/v1/jobs/bulk').reply(400, {
        errors: [{
          errorCode: 'JOB1008',
          message: 'Bulk operation limit exceeded',
          statusCode: 400,
        }],
      });

      await expect(JobService.bulkDeleteJobs(jobIds)).rejects.toThrow(AppError);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a job', async () => {
      const responseData = {
        message: 'Job cancelled',
        job_id: '123',
      };

      mockAxios.onPost('/v1/jobs/123/cancel').reply(200, responseData);

      const result = await JobService.cancelJob('123');

      expect(result.job_id).toBe('123');
      expect(result.message).toBe('Job cancelled');
    });

    it('should handle invalid state error', async () => {
      mockAxios.onPost('/v1/jobs/123/cancel').reply(400, {
        errors: [{
          errorCode: 'JOB1003',
          message: 'Cannot cancel job in current state',
          statusCode: 400,
        }],
      });

      await expect(JobService.cancelJob('123')).rejects.toThrow(AppError);
    });
  });

  describe('refreshJobs', () => {
    it('should refresh jobs list', async () => {
      const responseData = {
        jobs: [],
        total: 0,
        page: 1,
        page_size: 20,
      };

      mockAxios.onGet('/v1/jobs').reply(200, responseData);

      const result = await JobService.refreshJobs();

      expect(result).toEqual(responseData);
    });

    it('should pass parameters to refresh', async () => {
      mockAxios.onGet('/v1/jobs', { params: { page: 3 } })
        .reply(200, { jobs: [], total: 0, page: 3, page_size: 20 });

      const result = await JobService.refreshJobs({ page: 3 });

      expect(result.page).toBe(3);
    });
  });
});
