import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { SourcesService } from './sources.service';
import { SourceResponseDto, OAuthInitiateResponseDto } from './dto/sources.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * SourcesController — REST endpoints for managing knowledge source connections.
 *
 * Routes:
 * - GET  /sources                       List connected sources (JWT)
 * - GET  /sources/google-drive/oauth    Initiate Google Drive OAuth (@Public)
 * - GET  /sources/google-drive/callback Handle Google OAuth callback (@Public)
 * - GET  /sources/:id                   Get a single source (JWT)
 * - DELETE /sources/:id                 Disconnect a source (JWT)
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
}
