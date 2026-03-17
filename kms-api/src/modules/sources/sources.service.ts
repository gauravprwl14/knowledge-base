import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { KmsSource, SourceStatus, SourceType } from '@prisma/client';
import { SourceRepository } from '../../database/repositories/source.repository';
import { TokenEncryptionService } from './token-encryption.service';
import { ErrorFactory } from '../../errors/types/error-factory';
import { Trace } from '../../telemetry/decorators/trace.decorator';
import { SourceResponseDto } from './dto/sources.dto';

/**
 * SourcesService — business logic for managing knowledge source connections.
 *
 * Responsibilities:
 * - List / get sources scoped to the authenticated user
 * - Initiate Google Drive OAuth flow (returns consent URL)
 * - Handle Google OAuth callback: exchange auth code, encrypt tokens, persist source
 * - Disconnect a source (sets status to DISCONNECTED)
 *
 * Token security contract:
 * - OAuth tokens are ALWAYS encrypted before persistence via TokenEncryptionService
 * - `encryptedTokens` is NEVER included in any response DTO or log statement
 *
 * @example
 * ```typescript
 * // In a controller
 * const { authUrl } = await sourcesService.initiateGoogleDriveOAuth(userId);
 * res.redirect(authUrl);
 * ```
 */
@Injectable()
export class SourcesService {
  constructor(
    private readonly sourceRepository: SourceRepository,
    private readonly tokenEncryptionService: TokenEncryptionService,
    @InjectPinoLogger(SourcesService.name)
    private readonly logger: PinoLogger,
  ) {}

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

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri:
        process.env.GOOGLE_REDIRECT_URI ||
        'http://localhost:8000/api/v1/sources/google-drive/callback',
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
    });

    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  /**
   * Handles the Google OAuth callback.
   *
   * Production flow (Sprint 4+): exchange `code` for real tokens via googleapis.
   * Current sprint stub: wraps the code in a mock token payload so that the
   * encrypt → store → respond pipeline can be tested end-to-end.
   *
   * Tokens are encrypted before storage and are NEVER returned to the caller.
   *
   * @param code - Authorization code from Google
   * @param userId - User UUID extracted from the OAuth `state` param
   * @returns SourceResponseDto for the newly created source
   */
  @Trace({ name: 'sources.handleGoogleCallback' })
  async handleGoogleCallback(code: string, userId: string): Promise<SourceResponseDto> {
    this.logger.info({ userId }, 'Handling Google Drive OAuth callback');

    // Stub: In production, exchange code via googleapis SDK (Sprint 4)
    const mockTokens = JSON.stringify({ access_token: 'stub', refresh_token: 'stub', code });
    const encryptedTokens = this.tokenEncryptionService.encrypt(mockTokens);

    const source = await this.sourceRepository.create({
      userId,
      type: SourceType.GOOGLE_DRIVE,
      name: 'Google Drive',
      displayName: 'Google Drive',
      encryptedTokens,
      status: SourceStatus.CONNECTED,
    });

    this.logger.info({ sourceId: source.id, userId }, 'Google Drive source connected');

    return this.toResponseDto(source);
  }

  /**
   * Disconnects a source by setting its status to DISCONNECTED.
   * Throws 404 if the source does not exist or belongs to a different user.
   * Throws 403 if the source is already disconnected (idempotent guard).
   *
   * @param id - Source UUID
   * @param userId - Authenticated user UUID (ownership check)
   */
  @Trace({ name: 'sources.disconnectSource' })
  async disconnectSource(id: string, userId: string): Promise<void> {
    this.logger.info({ sourceId: id, userId }, 'Disconnecting source');

    const source = await this.sourceRepository.findByIdAndUserId(id, userId);

    if (!source) {
      throw ErrorFactory.notFound('Source', id);
    }

    if (source.status === SourceStatus.DISCONNECTED) {
      // Already disconnected — treat as success (idempotent)
      this.logger.info({ sourceId: id }, 'Source already disconnected, no-op');
      return;
    }

    await this.sourceRepository.disconnect(id);

    this.logger.info({ sourceId: id, userId }, 'Source disconnected successfully');
  }
}
