import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';

/**
 * ContentStoreService persists YAML-frontmatted markdown files produced by
 * the WorkflowProcessor to a local filesystem directory.
 *
 * Storage layout:
 * ```
 * {CONTENT_STORE_PATH}/
 *   {jobId}.md          ← one file per ingested URL
 * ```
 *
 * CONTENT_STORE_PATH defaults to /tmp/kms-content which is writable without
 * any Docker volume config — useful for local dev and CI.
 * In production this should be set to a mounted persistent volume.
 *
 * Each file is named after its jobId (UUID v4) to guarantee uniqueness and
 * enable O(1) look-up without an index.
 */
@Injectable()
export class ContentStoreService {
  /** Absolute path to the directory where markdown files are written. */
  private readonly storePath: string;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    // Bind class name as structured logging context for every log emitted here
    this.logger = logger.child({ context: ContentStoreService.name });

    // Read from env so the path can be overridden per environment
    this.storePath = this.configService.get<string>(
      'CONTENT_STORE_PATH',
      '/tmp/kms-content',
    );
  }

  /**
   * Write markdown content to the content store.
   *
   * The directory is created recursively if it does not exist so the service
   * is self-initialising — no manual setup required in dev or CI.
   *
   * @param jobId   - Unique job ID used as the filename (without extension).
   * @param content - YAML-frontmatted markdown string to persist.
   * @returns Absolute path of the written file (useful for logging / audit).
   * @throws AppError(SRV0006) if the filesystem write fails after directory creation.
   */
  async write(jobId: string, content: string): Promise<string> {
    // Ensure the store directory exists — idempotent, safe to call every time
    try {
      await fs.mkdir(this.storePath, { recursive: true });
    } catch (err) {
      this.logger.error('Failed to create content store directory', {
        storePath: this.storePath,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.SRV.FILE_SYSTEM_ERROR.code,
        message: `Failed to create content store directory`,
        cause: err instanceof Error ? err : undefined,
      });
    }

    // Build the absolute file path using the jobId as the stem
    const filePath = path.join(this.storePath, `${jobId}.md`);

    try {
      // Write UTF-8 encoded markdown to disk; overwrites if the file exists
      // (unlikely with UUID filenames but safe to handle)
      await fs.writeFile(filePath, content, 'utf-8');
    } catch (err) {
      // Wrap filesystem errors in a typed AppError so the exception filter
      // produces a structured JSON response rather than a raw Node error
      this.logger.error('Failed to write content to store', {
        jobId,
        filePath,
        error: (err as Error).message,
      });
      throw new AppError({
        code: ERROR_CODES.SRV.FILE_SYSTEM_ERROR.code,
        message: `Failed to write content file for job ${jobId}`,
        cause: err instanceof Error ? err : undefined,
      });
    }

    this.logger.info('Content written to store', { jobId, filePath });
    return filePath;
  }

  /**
   * Read a previously stored markdown file by job ID.
   *
   * Returns `null` rather than throwing when the file does not exist,
   * making it safe for polling / idempotency checks without try-catch at
   * the call site.
   *
   * @param jobId - UUID v4 job identifier (stem of the markdown filename).
   * @returns The raw markdown string, or `null` if not found.
   */
  async read(jobId: string): Promise<string | null> {
    const filePath = path.join(this.storePath, `${jobId}.md`);
    try {
      // readFile throws ENOENT when file is missing — surface as AppError
      return await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new AppError({
          code: ERROR_CODES.SRV.FILE_SYSTEM_ERROR.code,
          message: `Content file not found for job ${jobId}`,
          cause: err instanceof Error ? err : undefined,
        });
      }
      return null;
    }
  }
}
