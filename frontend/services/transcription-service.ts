/**
 * Transcription service - handles all transcription-related API calls
 */

import { apiClient } from './api-client';

export interface Transcription {
  id: string;
  job_id: string;
  text: string;
  language: string | null;
  confidence: number | null;
  word_count: number | null;
  processing_time_ms: number | null;
  provider: string | null;
  model_name: string | null;
  segments: any[] | null;
  created_at: string;
}

export interface TranscriptionListResponse {
  transcriptions: Transcription[];
  total: number;
  page: number;
  page_size: number;
}

export interface TranscriptionQueryParams {
  page?: number;
  page_size?: number;
}

export interface DownloadFormat {
  format: 'txt' | 'srt' | 'json';
}

export class TranscriptionService {
  /**
   * Get list of transcriptions
   */
  static async listTranscriptions(
    params?: TranscriptionQueryParams
  ): Promise<TranscriptionListResponse> {
    return apiClient.get<TranscriptionListResponse>('/v1/transcriptions', {
      params,
    });
  }

  /**
   * Get single transcription by ID
   */
  static async getTranscription(transcriptionId: string): Promise<Transcription> {
    return apiClient.get<Transcription>(`/v1/transcriptions/${transcriptionId}`);
  }

  /**
   * Get transcription by job ID
   */
  static async getTranscriptionByJobId(jobId: string): Promise<Transcription | null> {
    const response = await this.listTranscriptions();
    return response.transcriptions.find((t) => t.job_id === jobId) || null;
  }

  /**
   * Download transcription
   */
  static async downloadTranscription(
    transcriptionId: string,
    format: 'txt' | 'srt' | 'json' = 'txt'
  ): Promise<Blob> {
    const response = await fetch(
      `/api/v1/transcriptions/${transcriptionId}/download?format=${format}`
    );

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Helper to trigger download in browser
   */
  static triggerBrowserDownload(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
