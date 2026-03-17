'use strict';
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { google, Auth } from 'googleapis';
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
    if (!code) throw new BadRequestException('Missing authorization code');
    if (!userId) throw new BadRequestException('Missing state (userId)');

    this.logger.info({ userId }, 'Handling Google Drive OAuth callback');

    // Exchange authorization code for tokens
    let tokens: Auth.Credentials;
    try {
      const { tokens: t } = await this.oauth2Client.getToken(code);
      tokens = t;
    } catch (err: unknown) {
      this.logger.error({ err, userId }, 'Google token exchange failed');
      throw new BadRequestException('Failed to exchange authorization code with Google');
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
   * Throws 404 if the source does not exist or belongs to a different user.
   * Idempotent if the source is already disconnected.
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
}
