import {
  Controller,
  Get,
  Post,
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
  registerLocalSourceSchema,
  registerObsidianVaultSchema,
} from './dto/sources.dto';
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
 * - GET    /sources                       List connected sources (JWT)
 * - GET    /sources/google-drive/oauth    Initiate Google Drive OAuth (@Public)
 * - GET    /sources/google-drive/callback Handle Google OAuth callback (@Public)
 * - GET    /sources/:id                   Get a single source (JWT)
 * - DELETE /sources/:id                   Disconnect a source (JWT)
 * - POST   /sources/local                 Register a local filesystem folder (JWT)
 * - POST   /sources/obsidian              Register an Obsidian vault (JWT)
 *
 * IMPORTANT: The two static sub-routes (`google-drive/oauth`,
 * `google-drive/callback`) are declared BEFORE the dynamic `:id` route so that
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
  @HttpCode(HttpStatus.CREATED)
  @ApiEndpoint({
    summary: 'Google Drive OAuth callback',
    description:
      'Receives the authorization code from Google, stubs token exchange, ' +
      'encrypts tokens, and persists a new GOOGLE_DRIVE source.',
    responseType: SourceResponseDto,
    successStatus: HttpStatus.CREATED,
    responses: [
      { status: HttpStatus.BAD_REQUEST, description: 'Missing or invalid code / state' },
    ],
  })
  @ApiQuery({ name: 'code', required: true, type: String, description: 'OAuth authorization code from Google' })
  @ApiQuery({ name: 'state', required: true, type: String, description: 'userId embedded during OAuth initiation' })
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
  ): Promise<SourceResponseDto> {
    return this.sourcesService.handleGoogleCallback(code, userId);
  }

  // ---------------------------------------------------------------------------
  // Parameterised authenticated routes (must come after static sub-routes)
  // IMPORTANT: static sub-paths like :id/clear-status must be declared BEFORE
  // the bare :id routes to prevent NestJS/Fastify treating "clear-status" as an id.
  // ---------------------------------------------------------------------------

  /**
   * Returns the latest data-clear job for a source.
   * Useful for polling progress after DELETE /sources/:id?clearData=true.
   * Returns null (200) if no clear job has ever been triggered for this source.
   *
   * IMPORTANT: this route is declared before GET :id to avoid route collision.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get(':id/clear-status')
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiEndpoint({
    summary: 'Get data clear progress',
    description:
      'Returns the most recent KmsClearJob for the source. ' +
      'Poll this endpoint after DELETE /sources/:id?clearData=true to track progress.',
    responses: [
      { status: HttpStatus.OK, description: 'KmsClearJob record or null' },
    ],
  })
  async getClearStatus(
    @Param('id') sourceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.sourcesService.getLatestClearJob(userId, sourceId);
  }

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
   * Disconnects a source (sets status to DISCONNECTED, always wipes OAuth tokens).
   *
   * Pass `?clearData=true` to also launch an async background job that deletes
   * all indexed files, chunks, and Qdrant vectors for the source. The response
   * will include a `jobId` which can be polled via GET /sources/:id/clear-status.
   *
   * Returns 404 if the source does not exist or belongs to a different user.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiQuery({
    name: 'clearData',
    required: false,
    type: String,
    description: 'Pass "true" to async-delete all indexed files and vectors',
  })
  @ApiEndpoint({
    summary: 'Disconnect a source',
    description:
      'Disconnects source. Pass ?clearData=true to also delete all indexed files and vectors.',
    responses: [
      { status: HttpStatus.OK, description: 'Disconnected (with optional jobId if clearData=true)' },
      { status: HttpStatus.NOT_FOUND, description: 'Source not found' },
    ],
  })
  async disconnectSource(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('clearData') clearData: string = 'false',
  ): Promise<{ message: string; jobId?: string }> {
    const result = await this.sourcesService.disconnectSource(id, userId, clearData === 'true');
    return { message: 'Source disconnected', ...result };
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
