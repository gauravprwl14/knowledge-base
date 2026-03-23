'use strict';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { google, Auth } from 'googleapis';
import { KmsSource, KmsClearJob, SourceStatus, SourceType } from '@prisma/client';
import { SourceRepository } from '../../database/repositories/source.repository';
import { PrismaService } from '../../database/prisma/prisma.service';
import { TokenEncryptionService } from './token-encryption.service';
import { ErrorFactory } from '../../errors/types/error-factory';
import { ERROR_CODES } from '../../errors/error-codes';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { DriveFolderDto, SourceResponseDto, UpdateSourceConfigDto } from './dto/sources.dto';

/**
 * SourcesService — business logic for managing knowledge source connections.
 *
 * Responsibilities:
 * - List / get sources scoped to the authenticated user
 * - Initiate Google Drive OAuth flow (returns consent URL)
 * - Handle Google OAuth callback: exchange auth code via googleapis, encrypt tokens, persist source
 * - Disconnect a source (sets status to DISCONNECTED)
 * - Refresh expired OAuth access tokens and persist updated credentials
 *
 * Token security contract:
 * - OAuth tokens are ALWAYS encrypted before persistence via TokenEncryptionService
 * - `encryptedTokens` is NEVER included in any response DTO or log statement
 */
@Injectable()
export class SourcesService {
  private readonly oauth2Client: Auth.OAuth2Client;

  constructor(
    private readonly sourceRepository: SourceRepository,
    private readonly prisma: PrismaService,
    private readonly tokenEncryptionService: TokenEncryptionService,
    @InjectPinoLogger(SourcesService.name)
    private readonly logger: PinoLogger,
  ) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8000/api/v1/sources/google-drive/callback',
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Maps a Prisma KmsSource to a SourceResponseDto, excluding sensitive fields.
   * `encryptedTokens` and `configJson` are intentionally omitted.
   *
   * @param source - Raw Prisma KmsSource entity
   * @returns Safe response DTO
   */
  private toResponseDto(source: KmsSource): SourceResponseDto {
    return {
      id: source.id,
      userId: source.userId,
      type: source.type,
      status: source.status,
      displayName: source.displayName,
      externalId: source.externalId,
      lastSyncedAt: source.lastSyncedAt,
      createdAt: source.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Returns all sources connected by the given user.
   * Tokens are never included in the returned DTOs.
   *
   * @param userId - Authenticated user UUID
   * @returns Array of SourceResponseDto (no sensitive token data)
   */
  @Trace({ name: 'sources.listSources' })
  async listSources(userId: string): Promise<SourceResponseDto[]> {
    this.logger.info({ userId }, 'Listing sources for user');
    const sources = await this.sourceRepository.findByUserId(userId);
    return sources.map((s) => this.toResponseDto(s));
  }

  /**
   * Returns a single source by ID.
   * Throws 404 if the source does not exist or belongs to a different user.
   *
   * @param id - Source UUID
   * @param userId - Authenticated user UUID (ownership check)
   * @returns SourceResponseDto
   * @throws AppError(404) if not found or wrong owner
   */
  @Trace({ name: 'sources.getSource' })
  async getSource(id: string, userId: string): Promise<SourceResponseDto> {
    this.logger.info({ sourceId: id, userId }, 'Getting source');
    const source = await this.sourceRepository.findByIdAndUserId(id, userId);

    if (!source) {
      throw ErrorFactory.notFound('Source', id);
    }

    return this.toResponseDto(source);
  }

  /**
   * Builds a Google Drive OAuth 2.0 consent URL and returns it.
   * The `state` parameter carries the userId so the callback can associate
   * the new source with the correct user without requiring a session.
   *
   * No database record is created at this stage.
   *
   * @param userId - Authenticated user UUID (passed as OAuth state)
   * @returns Object containing the Google consent URL
   */
  @Trace({ name: 'sources.initiateGoogleDriveOAuth' })
  async initiateGoogleDriveOAuth(userId: string): Promise<{ authUrl: string }> {
    this.logger.info({ userId }, 'Initiating Google Drive OAuth flow');

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
      prompt: 'consent',
      state: userId,
      include_granted_scopes: true,
    });

    this.logger.info({ userId }, 'Google Drive OAuth URL generated');
    return { authUrl };
  }

  /**
   * Handles the Google OAuth callback.
   *
   * Exchanges the authorization code for real OAuth tokens via googleapis,
   * fetches the user's Google Drive email for display, encrypts and persists
   * the tokens, and returns a SourceResponseDto.
   *
   * If a source for this user+type already exists and is not DISCONNECTED,
   * the existing record is updated (reconnect flow). Otherwise a new record
   * is created.
   *
   * Tokens are encrypted before storage and are NEVER returned to the caller.
   *
   * @param code - Authorization code from Google
   * @param userId - User UUID extracted from the OAuth `state` param
   * @returns SourceResponseDto for the newly created or updated source
   */
  @Trace({ name: 'sources.handleGoogleCallback' })
  async handleGoogleCallback(code: string, userId: string): Promise<SourceResponseDto> {
    if (!code) throw ErrorFactory.authentication(ERROR_CODES.AUT.OAUTH_FAILED.code, 'Missing authorization code');
    if (!userId) throw ErrorFactory.authentication(ERROR_CODES.AUT.OAUTH_FAILED.code, 'Missing state (userId)');

    this.logger.info({ userId }, 'Handling Google Drive OAuth callback');

    // Exchange authorization code for tokens
    let tokens: Auth.Credentials;
    try {
      const { tokens: t } = await this.oauth2Client.getToken(code);
      tokens = t;
    } catch (err: unknown) {
      this.logger.error({ err, userId }, 'Google token exchange failed');
      throw ErrorFactory.authentication(ERROR_CODES.AUT.OAUTH_FAILED.code, 'Failed to exchange authorization code with Google');
    }

    // Get Drive "About" info to use the user's email as displayName
    this.oauth2Client.setCredentials(tokens);
    let driveEmail = 'Google Drive';
    try {
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      const about = await drive.about.get({ fields: 'user' });
      driveEmail = about.data.user?.emailAddress ?? 'Google Drive';
    } catch {
      // Non-fatal — displayName fallback is fine
    }

    const encryptedTokens = this.tokenEncryptionService.encrypt(JSON.stringify(tokens));

    // Check if a source already exists for this user+type (reconnect flow)
    const existing = await this.sourceRepository.findFirst({
      userId,
      type: SourceType.GOOGLE_DRIVE,
      status: { not: SourceStatus.DISCONNECTED } as never,
    });

    let source: KmsSource;
    if (existing) {
      source = await this.sourceRepository.update(
        { id: existing.id },
        { encryptedTokens, status: SourceStatus.CONNECTED, displayName: driveEmail },
      );
    } else {
      source = await this.sourceRepository.create({
        userId,
        type: SourceType.GOOGLE_DRIVE,
        name: driveEmail,
        displayName: driveEmail,
        status: SourceStatus.CONNECTED,
        encryptedTokens,
      });
    }

    this.logger.info({ userId, sourceId: source.id, driveEmail }, 'Google Drive source connected');
    return this.toResponseDto(source);
  }

  /**
   * Disconnects a source by setting its status to DISCONNECTED.
   *
   * When `clearData=false` (default): marks the source DISCONNECTED and wipes
   * OAuth tokens but leaves all indexed files, chunks, and vectors intact.
   *
   * When `clearData=true`: also launches an async background job that
   * batch-deletes all kms_files, kms_chunks, Qdrant vectors, and scan jobs
   * for the source. The job ID is returned so the client can poll for progress
   * via GET /sources/:id/clear-status.
   *
   * Throws 404 if the source does not exist or belongs to a different user.
   * Idempotent if the source is already disconnected.
   *
   * @param id - Source UUID
   * @param userId - Authenticated user UUID (ownership check)
   * @param clearData - When true, schedules async deletion of all indexed data
   * @returns Object with optional jobId when clearData=true
   */
  @Trace({ name: 'sources.disconnectSource' })
  async disconnectSource(
    id: string,
    userId: string,
    clearData = false,
  ): Promise<{ jobId?: string }> {
    this.logger.info({ sourceId: id, userId, clearData }, 'Disconnecting source');

    const source = await this.sourceRepository.findByIdAndUserId(id, userId);

    if (!source) {
      throw ErrorFactory.notFound('Source', id);
    }

    if (source.status === SourceStatus.DISCONNECTED && !clearData) {
      // Already disconnected without clear — treat as success (idempotent)
      this.logger.info({ sourceId: id }, 'Source already disconnected, no-op');
      return {};
    }

    // Always wipe OAuth tokens on disconnect for security
    await this.sourceRepository.update(
      { id },
      {
        status: SourceStatus.DISCONNECTED,
        encryptedTokens: null,
      },
    );

    this.logger.info({ sourceId: id, userId }, 'Source disconnected successfully');

    if (!clearData) {
      return {};
    }

    // Count files up-front so the job record has an accurate total
    const totalFiles = await this.prisma.kmsFile.count({ where: { sourceId: id } });

    const clearJob = await this.prisma.kmsClearJob.create({
      data: {
        sourceId: id,
        userId,
        status: 'RUNNING',
        totalFiles,
      },
    });

    this.logger.info(
      { sourceId: id, userId, clearJobId: clearJob.id, totalFiles },
      'clear_job_started',
    );

    // Fire-and-forget — do NOT await; respond immediately with jobId
    this.runClearJob(clearJob.id, id, userId).catch((err) => {
      this.logger.error({ err, clearJobId: clearJob.id }, 'clear_job_failed');
    });

    return { jobId: clearJob.id };
  }

  /**
   * Returns the most recent KmsClearJob for a source owned by the given user.
   * Useful for polling clear progress after DELETE /sources/:id?clearData=true.
   *
   * @param userId - Authenticated user UUID (ownership check)
   * @param sourceId - Source UUID
   * @returns Latest KmsClearJob or null if none exists
   */
  async getLatestClearJob(userId: string, sourceId: string): Promise<KmsClearJob | null> {
    return this.prisma.kmsClearJob.findFirst({
      where: { sourceId, userId },
      orderBy: { startedAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Private — background clear job
  // ---------------------------------------------------------------------------

  /**
   * Batch-deletes all indexed data for a source: kms_files (cascade-deletes
   * chunks, transcription links, collection memberships), Qdrant vectors,
   * and scan jobs. Updates the KmsClearJob progress record after each batch.
   *
   * @param jobId - KmsClearJob UUID to update with progress
   * @param sourceId - Source UUID whose data should be cleared
   * @param userId - Owner UUID (for logging)
   */
  private async runClearJob(jobId: string, sourceId: string, userId: string): Promise<void> {
    const BATCH_SIZE = 100;
    let filesCleared = 0;
    let chunksCleared = 0;
    let vectorsCleared = 0;

    try {
      while (true) {
        const files = await this.prisma.kmsFile.findMany({
          where: { sourceId },
          take: BATCH_SIZE,
          select: { id: true },
        });

        if (files.length === 0) break;

        const fileIds = files.map((f) => f.id);

        // Count chunks before deletion so we can report accurate numbers
        const chunkCount = await this.prisma.kmsChunk.count({
          where: { fileId: { in: fileIds } },
        });

        // Delete Qdrant vectors first — prevents orphaned vectors if PG fails
        await this.deleteQdrantPoints(fileIds);

        // Delete from PostgreSQL — cascade handles chunks, transcription links,
        // collection memberships, file tags, and duplicates automatically
        await this.prisma.kmsFile.deleteMany({ where: { id: { in: fileIds } } });

        filesCleared += fileIds.length;
        chunksCleared += chunkCount;
        vectorsCleared += chunkCount; // one Qdrant point per chunk

        // Persist incremental progress for the polling endpoint
        await this.prisma.kmsClearJob.update({
          where: { id: jobId },
          data: { filesCleared, chunksCleared, vectorsCleared },
        });

        this.logger.info(
          { jobId, sourceId, filesCleared, chunksCleared },
          'clear_job_batch_done',
        );
      }

      // Remove scan jobs for the source (not file-scoped, so not cascade-deleted)
      await this.prisma.kmsScanJob.deleteMany({ where: { sourceId } });

      await this.prisma.kmsClearJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          finishedAt: new Date(),
          filesCleared,
          chunksCleared,
          vectorsCleared,
        },
      });

      this.logger.info(
        { jobId, sourceId, userId, filesCleared, chunksCleared, vectorsCleared },
        'clear_job_completed',
      );
    } catch (err) {
      this.logger.error({ err, jobId, sourceId }, 'clear_job_error');

      await this.prisma.kmsClearJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          errorMsg: (err as Error).message,
          finishedAt: new Date(),
        },
      });
    }
  }

  /**
   * Deletes Qdrant vector points whose ``file_id`` payload field matches any
   * of the given file UUIDs.
   *
   * Uses a filter-based delete so bulk deletion is performed in a single HTTP
   * request rather than one request per point.
   *
   * @param fileIds - Array of kms_file UUIDs whose vectors should be removed
   */
  private async deleteQdrantPoints(fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;

    const qdrantUrl = process.env.QDRANT_URL ?? 'http://qdrant:6333';
    const collection = process.env.QDRANT_COLLECTION ?? 'kms_chunks';

    try {
      const response = await fetch(
        `${qdrantUrl}/collections/${collection}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              must: [
                {
                  key: 'file_id',
                  match: { any: fileIds },
                },
              ],
            },
          }),
        },
      );

      if (!response.ok) {
        this.logger.warn(
          { status: response.status, fileIds: fileIds.length },
          'qdrant_delete_non_200',
        );
      }
    } catch (err) {
      // Log but don't rethrow — a Qdrant failure should not abort the PG cleanup
      this.logger.warn({ err, fileIds: fileIds.length }, 'qdrant_delete_failed');
    }
  }

  /**
   * Returns decrypted OAuth tokens for internal use by the scan worker.
   * Never expose this via a controller response.
   *
   * @param sourceId - Source UUID
   * @param userId - Owner user UUID (ownership check)
   * @returns Decrypted Auth.Credentials
   */
  @Trace({ name: 'sources.getDecryptedTokens' })
  async getDecryptedTokens(sourceId: string, userId: string): Promise<Auth.Credentials> {
    const source = await this.sourceRepository.findByIdAndUserId(sourceId, userId);
    if (!source) throw ErrorFactory.notFound('Source', sourceId);
    if (!source.encryptedTokens) throw ErrorFactory.notFound('Tokens', sourceId);
    return JSON.parse(this.tokenEncryptionService.decrypt(source.encryptedTokens)) as Auth.Credentials;
  }

  /**
   * Refreshes an expired access token and persists the new credentials.
   * Called by the scan worker before making Drive API requests.
   *
   * @param sourceId - Source UUID
   * @param userId - Owner user UUID (ownership check)
   * @returns Fresh Auth.Credentials
   */
  @Trace({ name: 'sources.refreshAccessToken' })
  async refreshAccessToken(sourceId: string, userId: string): Promise<Auth.Credentials> {
    const tokens = await this.getDecryptedTokens(sourceId, userId);
    this.oauth2Client.setCredentials(tokens);
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    const encryptedTokens = this.tokenEncryptionService.encrypt(JSON.stringify(credentials));
    await this.sourceRepository.update({ id: sourceId }, { encryptedTokens });
    return credentials;
  }

  /**
   * Updates the sync configuration for a source.
   *
   * Merges the provided fields into the existing `configJson` — a partial
   * update, not a replacement.  Ownership is verified before the update.
   *
   * @param userId - Authenticated user UUID (ownership check)
   * @param sourceId - Source UUID
   * @param dto - Fields to merge into `configJson`
   * @returns Updated SourceResponseDto
   * @throws AppError(404) if source not found or belongs to a different user
   */
  @Trace({ name: 'sources.updateConfig' })
  async updateConfig(userId: string, sourceId: string, dto: UpdateSourceConfigDto): Promise<SourceResponseDto> {
    this.logger.info({ userId, sourceId }, 'Updating source config');

    const source = await this.sourceRepository.findByIdAndUserId(sourceId, userId);
    if (!source) {
      throw ErrorFactory.notFound('Source', sourceId);
    }

    const currentConfig = (source.configJson as Record<string, unknown>) ?? {};
    const updatedConfig = { ...currentConfig, ...dto };

    const updated = await this.sourceRepository.update(
      { id: sourceId },
      { configJson: updatedConfig },
    );

    this.logger.info({ userId, sourceId }, 'Source config updated');
    return this.toResponseDto(updated);
  }

  /**
   * Lists Google Drive folders under a given parent for the connected source.
   *
   * Decrypts OAuth2 tokens, builds a Drive API client, and queries folders
   * one level deep from the specified parent.  Used by the UI folder-picker.
   *
   * @param userId - Authenticated user UUID (ownership check)
   * @param sourceId - Source UUID (must be GOOGLE_DRIVE type)
   * @param parentId - Drive folder ID to list children of (default: 'root')
   * @returns Object containing array of DriveFolderDto
   * @throws AppError(404) if source not found or not owned by user
   * @throws AppError(500) on Drive API failure
   */
  @Trace({ name: 'sources.listDriveFolders' })
  async listDriveFolders(
    userId: string,
    sourceId: string,
    parentId: string = 'root',
  ): Promise<{ folders: DriveFolderDto[] }> {
    this.logger.info({ userId, sourceId, parentId }, 'Listing Google Drive folders');

    const source = await this.sourceRepository.findByIdAndUserId(sourceId, userId);
    if (!source) {
      throw ErrorFactory.notFound('Source', sourceId);
    }
    if (!source.encryptedTokens) {
      throw ErrorFactory.notFound('Tokens', sourceId);
    }

    const decryptedTokens = this.tokenEncryptionService.decrypt(source.encryptedTokens);
    const tokens = JSON.parse(decryptedTokens) as Auth.Credentials;

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth });

    let files: { id?: string | null; name?: string | null }[] = [];
    try {
      const response = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 100,
        orderBy: 'name',
      });
      files = response.data.files ?? [];
    } catch (err) {
      this.logger.error({ err, userId, sourceId, parentId }, 'Drive folders API call failed');
      throw ErrorFactory.internal('Failed to retrieve Google Drive folders');
    }

    const folders: DriveFolderDto[] = files.map((f) => ({
      id: f.id!,
      name: f.name!,
      path: parentId === 'root' ? f.name! : `${parentId}/${f.name}`,
      childCount: 0,
    }));

    this.logger.info({ userId, sourceId, parentId, count: folders.length }, 'Drive folders listed');
    return { folders };
  }

  /**
   * Registers a local filesystem folder as a knowledge source.
   *
   * If the user already has an active LOCAL source pointing to the same path,
   * the existing record is reconnected (status set to CONNECTED). Otherwise a
   * new source record is created with the path stored in `metadata.path`.
   *
   * The path must be accessible to the scan-worker container. For Docker
   * deployments use the mounted path (e.g. /data/documents).
   *
   * @param userId - Authenticated user UUID
   * @param path - Absolute filesystem path to the local folder
   * @param displayName - Optional human-readable label (defaults to folder name)
   * @returns SourceResponseDto for the newly created or reconnected source
   */
  @Trace({ name: 'sources.registerLocalSource' })
  async registerLocalSource(
    userId: string,
    path: string,
    displayName?: string,
  ): Promise<SourceResponseDto> {
    this.logger.info({ userId, path }, 'Registering local source');

    // Find any active LOCAL source for this user (not DISCONNECTED)
    const existing = await this.sourceRepository.findFirst({
      userId,
      type: SourceType.LOCAL,
      status: { not: SourceStatus.DISCONNECTED } as never,
    });

    // Only reconnect if the existing active source points to the same path
    const existingWithSamePath =
      existing && (existing.metadata as Record<string, unknown>)?.path === path ? existing : null;

    if (existingWithSamePath) {
      const updated = await this.sourceRepository.update(
        { id: existingWithSamePath.id },
        {
          status: SourceStatus.CONNECTED,
          displayName: displayName ?? existingWithSamePath.displayName,
        },
      );
      this.logger.info({ userId, path, sourceId: updated.id }, 'Local source reconnected');
      return this.toResponseDto(updated);
    }

    const resolvedName = displayName ?? path.split('/').pop() ?? 'Local Folder';

    const source = await this.sourceRepository.create({
      userId,
      type: SourceType.LOCAL,
      name: resolvedName,
      displayName: resolvedName,
      status: SourceStatus.CONNECTED,
      metadata: { path },
    });

    this.logger.info({ userId, path, sourceId: source.id }, 'Local source registered');
    return this.toResponseDto(source);
  }

  /**
   * Registers an Obsidian vault directory as a knowledge source.
   *
   * OBSIDIAN is a specialised LOCAL source — the vault path is stored in both
   * `metadata.path` and `metadata.vaultPath` for compatibility with the
   * scan-worker Obsidian connector. If the user already has an active OBSIDIAN
   * source at the same path, the existing record is reconnected.
   *
   * In Docker: mount the vault as a volume and pass the container path.
   * In local dev: pass the absolute path on the host.
   *
   * @param userId - Authenticated user UUID
   * @param vaultPath - Absolute filesystem path to the Obsidian vault
   * @param displayName - Optional human-readable label (defaults to vault folder name)
   * @returns SourceResponseDto for the newly created or reconnected source
   */
  @Trace({ name: 'sources.registerObsidianVault' })
  async registerObsidianVault(
    userId: string,
    vaultPath: string,
    displayName?: string,
  ): Promise<SourceResponseDto> {
    this.logger.info({ userId, vaultPath }, 'Registering Obsidian vault');

    // Find any active OBSIDIAN source for this user (not DISCONNECTED)
    const existing = await this.sourceRepository.findFirst({
      userId,
      type: SourceType.OBSIDIAN,
      status: { not: SourceStatus.DISCONNECTED } as never,
    });

    // Only reconnect if the existing active source points to the same vault path
    const existingWithSamePath =
      existing && (existing.metadata as Record<string, unknown>)?.path === vaultPath
        ? existing
        : null;

    if (existingWithSamePath) {
      const updated = await this.sourceRepository.update(
        { id: existingWithSamePath.id },
        {
          status: SourceStatus.CONNECTED,
          displayName: displayName ?? existingWithSamePath.displayName,
        },
      );
      this.logger.info({ userId, vaultPath, sourceId: updated.id }, 'Obsidian vault reconnected');
      return this.toResponseDto(updated);
    }

    const vaultName = displayName ?? vaultPath.split('/').pop() ?? 'Obsidian Vault';

    const source = await this.sourceRepository.create({
      userId,
      type: SourceType.OBSIDIAN,
      name: vaultName,
      displayName: vaultName,
      status: SourceStatus.CONNECTED,
      metadata: { path: vaultPath, vaultPath },
    });

    this.logger.info({ userId, vaultPath, sourceId: source.id }, 'Obsidian vault registered');
    return this.toResponseDto(source);
  }
}
