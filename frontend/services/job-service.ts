/**
 * Job service - handles all job-related API calls
 */

import { apiClient } from './api-client';

export interface Job {
  id: string;
  status: string;
  job_type: string;
  provider: string;
  model_name: string;
  original_filename: string;
  progress: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface JobListResponse {
  jobs: Job[];
  total: number;
  page: number;
  page_size: number;
}

export interface DeleteJobResponse {
  message: string;
  job_id: string;
  original_filename: string;
  status: string;
  files_deleted: string[];
  files_failed: Array<{ file: string; error: string }>;
}

export interface BulkDeleteRequest {
  job_ids: string[];
}

export interface BulkDeleteResponse {
  deleted_count: number;
  failed_count: number;
  total_requested: number;
  deleted_jobs: Array<{
    job_id: string;
    original_filename: string;
    status: string;
  }>;
  failed_jobs: Array<{
    job_id: string;
    original_filename: string;
    error: string;
  }>;
  files_deleted_count: number;
  files_failed_count: number;
  files_failed?: Array<{ file: string; error: string }>;
}

export interface CancelJobResponse {
  message: string;
  job_id: string;
}

export interface JobsQueryParams {
  page?: number;
  page_size?: number;
  status?: string;
}

export class JobService {
  /**
   * Get list of jobs
   */
  static async listJobs(params?: JobsQueryParams): Promise<JobListResponse> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiClient.get<JobListResponse>('/v1/jobs', { params: params as any });
  }

  /**
   * Get single job by ID
   */
  static async getJob(jobId: string): Promise<Job> {
    return apiClient.get<Job>(`/v1/jobs/${jobId}`);
  }

  /**
   * Delete a single job
   */
  static async deleteJob(jobId: string): Promise<DeleteJobResponse> {
    return apiClient.delete<DeleteJobResponse>(`/v1/jobs/${jobId}`);
  }

  /**
   * Bulk delete jobs
   */
  static async bulkDeleteJobs(
    jobIds: string[]
  ): Promise<BulkDeleteResponse> {
    const request: BulkDeleteRequest = { job_ids: jobIds };
    return apiClient.delete<BulkDeleteResponse>('/v1/jobs/bulk', { data: request });
  }

  /**
   * Cancel a job
   */
  static async cancelJob(jobId: string): Promise<CancelJobResponse> {
    return apiClient.post<CancelJobResponse>(`/v1/jobs/${jobId}/cancel`);
  }

  /**
   * Refresh jobs (same as list but more semantic)
   */
  static async refreshJobs(params?: JobsQueryParams): Promise<JobListResponse> {
    return this.listJobs(params);
  }
}
