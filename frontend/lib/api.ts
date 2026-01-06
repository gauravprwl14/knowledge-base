const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ApiOptions {
  apiKey: string;
}

export class VoiceAppApi {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: ApiOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = API_URL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: HeadersInit = {
      'X-API-Key': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  // Upload endpoints
  async uploadFile(
    file: File,
    options: {
      provider?: string;
      model?: string;
      language?: string;
      targetLanguage?: string;
    } = {}
  ) {
    const formData = new FormData();
    formData.append('file', file);
    if (options.provider) formData.append('provider', options.provider);
    if (options.model) formData.append('model_name', options.model);
    if (options.language) formData.append('language', options.language);
    if (options.targetLanguage)
      formData.append('target_language', options.targetLanguage);

    return this.request<{
      job_id: string;
      filename: string;
      file_size_bytes: number;
      status: string;
    }>('/api/v1/upload', {
      method: 'POST',
      body: formData,
    });
  }

  // Jobs endpoints
  async listJobs(page = 1, pageSize = 20) {
    return this.request<{
      jobs: any[];
      total: number;
      page: number;
      page_size: number;
    }>(`/api/v1/jobs?page=${page}&page_size=${pageSize}`);
  }

  async getJob(jobId: string) {
    return this.request<any>(`/api/v1/jobs/${jobId}`);
  }

  async deleteJob(jobId: string) {
    return this.request<{
      message: string;
      job_id: string;
      files_deleted: string[];
      files_failed: any[];
    }>(`/api/v1/jobs/${jobId}`, {
      method: 'DELETE',
    });
  }

  async cancelJob(jobId: string) {
    return this.request<{ message: string }>(`/api/v1/jobs/${jobId}/cancel`, {
      method: 'POST',
    });
  }

  // Transcriptions endpoints
  async listTranscriptions(page = 1, pageSize = 20) {
    return this.request<{
      transcriptions: any[];
      total: number;
      page: number;
      page_size: number;
    }>(`/api/v1/transcriptions?page=${page}&page_size=${pageSize}`);
  }

  async getTranscription(transcriptionId: string) {
    return this.request<any>(`/api/v1/transcriptions/${transcriptionId}`);
  }

  async translateTranscription(
    transcriptionId: string,
    targetLanguage: string,
    provider = 'openai'
  ) {
    return this.request<{
      id: string;
      translated_text: string;
      target_language: string;
    }>(`/api/v1/transcriptions/${transcriptionId}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_language: targetLanguage,
        provider,
      }),
    });
  }

  // Models endpoint
  async listModels() {
    return this.request<{
      models: any[];
    }>('/api/v1/models');
  }
}

export function createApi(apiKey: string) {
  return new VoiceAppApi({ apiKey });
}
