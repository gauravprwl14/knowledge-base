import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import { AppLogger } from '../../logger/logger.service';

/**
 * MinioService — thin wrapper around the MinIO SDK for transcript storage.
 *
 * Provides:
 * - {@link getPresignedUrl}: generate a short-lived download URL for a transcript
 * - {@link getTranscriptText}: fetch raw transcript text from MinIO
 *
 * Bucket: `kms-transcripts` (auto-created on first use via {@link ensureBucket}).
 *
 * Configuration is read from environment variables at construction time:
 * - `MINIO_ENDPOINT` — full URL, e.g. `http://minio:9000` (default: `http://localhost:9000`)
 * - `MINIO_ACCESS_KEY` — S3 access key (default: `minioadmin`)
 * - `MINIO_SECRET_KEY` — S3 secret key (default: `minioadmin`)
 * - `MINIO_BUCKET` — bucket name (default: `kms-transcripts`)
 * - `MINIO_SECURE` — set to `"true"` to enable TLS (default: `"false"`)
 */
@Injectable()
export class MinioService {
  private readonly client: Client;
  private readonly bucket: string;
  private bucketEnsured = false;
  private readonly logger: AppLogger;

  constructor(logger: AppLogger) {
    this.logger = logger.child({ context: MinioService.name });

    const endpoint = process.env.MINIO_ENDPOINT ?? 'http://localhost:9000';
    const url = new URL(endpoint);
    this.client = new Client({
      endPoint: url.hostname,
      port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '9000'), 10),
      useSSL: process.env.MINIO_SECURE === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    });
    this.bucket = process.env.MINIO_BUCKET ?? 'kms-transcripts';
  }

  /**
   * Returns a pre-signed GET URL valid for 15 minutes.
   *
   * Object key format: `transcripts/{userId}/{jobId}.txt`
   *
   * @param objectKey - MinIO object key for the transcript file.
   * @returns A short-lived pre-signed HTTPS/HTTP URL.
   */
  async getPresignedUrl(objectKey: string): Promise<string> {
    await this.ensureBucket();
    // 900 seconds = 15 minutes
    return this.client.presignedGetObject(this.bucket, objectKey, 900);
  }

  /**
   * Fetches the full transcript text from MinIO by reading the object stream.
   *
   * @param objectKey - MinIO object key for the transcript file.
   * @returns The UTF-8 transcript text.
   */
  async getTranscriptText(objectKey: string): Promise<string> {
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  /**
   * Uploads transcript text to MinIO and returns the object key.
   *
   * Object key format: `transcripts/{userId}/{jobId}.txt`
   *
   * @param jobId - Voice job UUID (used as part of the object key).
   * @param userId - Owning user UUID (used as part of the object key).
   * @param text - Full transcript text to store.
   * @returns The MinIO object key of the uploaded transcript.
   */
  async uploadTranscript(jobId: string, userId: string, text: string): Promise<string> {
    await this.ensureBucket();
    const objectKey = `transcripts/${userId}/${jobId}.txt`;
    const buffer = Buffer.from(text, 'utf-8');
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      'Content-Type': 'text/plain; charset=utf-8',
    });
    this.logger.info('transcript uploaded to minio', { objectKey, jobId, userId, bytes: buffer.length });
    return objectKey;
  }

  /**
   * Ensures the configured bucket exists — idempotent, called once per service instance.
   * Subsequent calls return immediately via the {@link bucketEnsured} flag.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.info('minio bucket created', { bucket: this.bucket });
    }
    this.bucketEnsured = true;
  }
}
