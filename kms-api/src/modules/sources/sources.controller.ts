import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { SourcesService } from './sources.service';
import {
  SourceResponseDto,
  OAuthInitiateResponseDto,
  RegisterLocalSourceRequestDto,
  RegisterObsidianVaultRequestDto,
  UpdateSourceConfigRequestDto,
  DriveFolderDto,
  registerLocalSourceSchema,
  registerObsidianVaultSchema,
  updateSourceConfigSchema,
  UpdateSourceConfigDto,
} from './dto/sources.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireFeature } from '../feature-flags/decorators/require-feature.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';

/**
 * SourcesController — REST endpoints for managing knowledge source connections.
 *
 * Routes:
 * - GET    /sources                           List connected sources (JWT)
 * - GET    /sources/google-drive/oauth        Initiate Google Drive OAuth (@Public)
 * - GET    /sources/google-drive/callback     Handle Google OAuth callback (@Public)
 * - GET    /sources/google-drive/folders      List Drive folders for folder picker (JWT)
 * - GET    /sources/:id                       Get a single source (JWT)
 * - DELETE /sources/:id                       Disconnect a source (JWT)
 * - PATCH  /sources/:id/config                Update source sync configuration (JWT)
 * - POST   /sources/local                     Register a local filesystem folder (JWT)
 * - POST   /sources/obsidian                  Register an Obsidian vault (JWT)
 *
 * IMPORTANT: Static sub-routes (`google-drive/oauth`, `google-drive/callback`,
 * `google-drive/folders`) are declared BEFORE the dynamic `:id` route so that
 * NestJS/Fastify routes them correctly without treating "google-drive" as an id.
 */
@ApiTags('Sources')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  // ---------------------------------------------------------------------------
  // Authenticated routes
  // ---------------------------------------------------------------------------

  /**
   * Returns all knowledge sources connected by the authenticated user.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get()
  @ApiEndpoint({
    summary: 'List connected sources',
    description: 'Returns all knowledge sources connected by the authenticated user',
    responseType: SourceResponseDto,
    isArray: true,
  })
  async listSources(@CurrentUser('id') userId: string): Promise<SourceResponseDto[]> {
    return this.sourcesService.listSources(userId);
  }

  // ---------------------------------------------------------------------------
  // Public OAuth routes (declared before :id to avoid route collision)
  // ---------------------------------------------------------------------------

  /**
   * Initiates Google Drive OAuth flow.
   *
   * The `userId` query param is required here because the endpoint is @Public
   * (the user may not yet have a JWT at the moment of OAuth initiation, or
   * the browser initiated the flow from a non-authenticated context).
   * In a fully integrated flow, the frontend passes the logged-in userId
   * obtained from a prior /auth/login response.
   *
   * Redirects the browser to the Google consent screen.
   */
  @Public()
  @RequireFeature('googleDrive')
  @UseGuards(FeatureFlagGuard)
  @Get('google-drive/oauth')
  @ApiEndpoint({
    summary: 'Initiate Google Drive OAuth',
    description:
      'Builds a Google OAuth consent URL and redirects the browser to it. ' +
      'Pass the authenticated userId as a query parameter.',
    responseType: OAuthInitiateResponseDto,
    responses: [
      { status: HttpStatus.FOUND, description: 'Redirects to Google consent screen' },
    ],
  })
  @ApiQuery({ name: 'userId', required: true, type: String, description: 'Authenticated user UUID' })
  async initiateGoogleDriveOAuth(
    @Query('userId') userId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { authUrl } = await this.sourcesService.initiateGoogleDriveOAuth(userId);
    reply.redirect(authUrl, 302);
  }

  /**
   * Google OAuth callback.
   *
   * Google redirects the browser here after the user grants (or denies) access.
   * The `code` query param contains the authorization code; `state` carries the
   * userId that was embedded during initiation.
   *
   * This endpoint is @Public because Google opens it directly, without the KMS
   * JWT header.  Ownership validation is performed inside SourcesService using
   * the userId from `state`.
   */
  @Public()
  @RequireFeature('googleDrive')
  @UseGuards(FeatureFlagGuard)
  @Get('google-drive/callback')
  @ApiEndpoint({
    summary: 'Google Drive OAuth callback',
    description:
      'Receives the authorization code from Google, exchanges it for tokens, ' +
      'encrypts them, persists the source, then redirects the browser back to ' +
      'the frontend sources page.',
    responseType: SourceResponseDto,
    responses: [
      { status: HttpStatus.FOUND, description: 'Redirects to frontend /sources page' },
      { status: HttpStatus.BAD_REQUEST, description: 'Missing or invalid code / state' },
    ],
  })
  @ApiQuery({ name: 'code', required: true, type: String, description: 'OAuth authorization code from Google' })
  @ApiQuery({ name: 'state', required: true, type: String, description: 'userId embedded during OAuth initiation' })
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    // Determine frontend base URL — falls back to same-origin /kms path
    const frontendBase =
      process.env.FRONTEND_URL ??
      process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ??
      'http://localhost:3000/kms';

    try {
      await this.sourcesService.handleGoogleCallback(code, userId);
      reply.redirect(`${frontendBase}/sources?connected=true`, 302);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? encodeURIComponent(err.message) : 'oauth_failed';
      reply.redirect(`${frontendBase}/sources?error=${message}`, 302);
    }
  }

  /**
   * Lists Google Drive folders one level below a given parent folder.
   * Used by the UI folder-picker to let users select which folders to sync.
   * Requires an authenticated, connected GOOGLE_DRIVE source.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('google-drive/folders')
  @RequireFeature('googleDrive')
  @UseGuards(FeatureFlagGuard)
  @ApiEndpoint({
    summary: 'List Google Drive folders',
    description: 'Returns folder list one level deep from the specified parent. Use parentId=root for the Drive root.',
    responses: [
      { status: HttpStatus.NOT_FOUND, description: 'Source not found or not owned by caller' },
    ],
  })
  @ApiQuery({ name: 'sourceId', required: true, type: String, description: 'Source UUID (must be GOOGLE_DRIVE type)' })
  @ApiQuery({ name: 'parentId', required: false, type: String, description: 'Parent Drive folder ID (default: root)' })
  async listDriveFolders(
    @CurrentUser('id') userId: string,
    @Query('sourceId') sourceId: string,
    @Query('parentId') parentId: string = 'root',
  ): Promise<{ folders: DriveFolderDto[] }> {
    return this.sourcesService.listDriveFolders(userId, sourceId, parentId);
  }

  // ---------------------------------------------------------------------------
  // Parameterised authenticated routes (must come after static sub-routes)
  // ---------------------------------------------------------------------------

  /**
   * Returns a single source by UUID.
   * Returns 404 if the source does not exist or belongs to a different user.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get(':id')
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiEndpoint({
    summary: 'Get a source by ID',
    description: 'Returns a single connected source. 404 if not found or not owned by caller.',
    responseType: SourceResponseDto,
    responses: [{ status: HttpStatus.NOT_FOUND, description: 'Source not found' }],
  })
  async getSource(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<SourceResponseDto> {
    return this.sourcesService.getSource(id, userId);
  }

  /**
   * Disconnects a source (sets status to DISCONNECTED).
   * Returns 404 if the source does not exist or belongs to a different user.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiEndpoint({
    summary: 'Disconnect a source',
    description: 'Sets the source status to DISCONNECTED. Idempotent if already disconnected.',
    successStatus: HttpStatus.NO_CONTENT,
    responses: [{ status: HttpStatus.NOT_FOUND, description: 'Source not found' }],
  })
  async disconnectSource(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.sourcesService.disconnectSource(id, userId);
  }

  /**
   * Updates the sync configuration for a source.
   * Merges provided fields into the existing configJson — partial update, not replacement.
   * Returns 404 if the source does not exist or belongs to a different user.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Patch(':id/config')
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiEndpoint({
    summary: 'Update source sync configuration',
    description: 'Updates folder filter, file type filter, and transcription rules. Fields are merged (not replaced).',
    responseType: SourceResponseDto,
    responses: [
      { status: HttpStatus.NOT_FOUND, description: 'Source not found' },
      { status: HttpStatus.BAD_REQUEST, description: 'Invalid configuration payload' },
    ],
  })
  async updateConfig(
    @CurrentUser('id') userId: string,
    @Param('id') sourceId: string,
    @Body(new ZodValidationPipe(updateSourceConfigSchema)) dto: UpdateSourceConfigDto,
  ): Promise<SourceResponseDto> {
    return this.sourcesService.updateConfig(userId, sourceId, dto);
  }

  /**
   * Register a local filesystem folder as a source.
   * The path must be accessible to the scan-worker container.
   * For Docker deployments, use the mounted path (e.g. /vault).
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('local')
  @HttpCode(HttpStatus.CREATED)
  @ApiEndpoint({
    summary: 'Register local folder as source',
    description:
      'Registers a local filesystem path. The scan-worker must have read access to this path.',
    responseType: SourceResponseDto,
    successStatus: HttpStatus.CREATED,
  })
  async registerLocalSource(
    @Body() body: RegisterLocalSourceRequestDto,
    @CurrentUser('id') userId: string,
  ): Promise<SourceResponseDto> {
    const dto = registerLocalSourceSchema.parse(body);
    return this.sourcesService.registerLocalSource(userId, dto.path, dto.displayName);
  }

  /**
   * Register an Obsidian vault as a source.
   * In Docker: mount the vault as a volume and pass the container path.
   * In local dev: pass the absolute path on the host.
   *
   * @example POST /sources/obsidian { "vaultPath": "/vault", "displayName": "My Notes" }
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Post('obsidian')
  @HttpCode(HttpStatus.CREATED)
  @ApiEndpoint({
    summary: 'Register Obsidian vault as source',
    description:
      'Registers an Obsidian vault directory. Use /vault if using the Docker test-vault mount.',
    responseType: SourceResponseDto,
    successStatus: HttpStatus.CREATED,
  })
  @ApiBody({
    schema: {
      example: { vaultPath: '/vault', displayName: 'My Knowledge Base' },
    },
  })
  async registerObsidianVault(
    @Body() body: RegisterObsidianVaultRequestDto,
    @CurrentUser('id') userId: string,
  ): Promise<SourceResponseDto> {
    const dto = registerObsidianVaultSchema.parse(body);
    return this.sourcesService.registerObsidianVault(userId, dto.vaultPath, dto.displayName);
  }
}
