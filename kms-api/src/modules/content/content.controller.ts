import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Sse,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Observable, interval } from 'rxjs';
import { switchMap, takeWhile, startWith } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentJobsService } from './content-jobs.service';
import { ContentPiecesService } from './content-pieces.service';
import { ContentChatService } from './content-chat.service';
import { ContentConfigService } from './content-config.service';
import { CreateContentJobDto } from './dto/create-content-job.dto';
import { ListContentJobsQueryDto } from './dto/list-content-jobs-query.dto';
import { UpdateContentPieceDto } from './dto/update-content-piece.dto';
import { GenerateVariationDto } from './dto/generate-variation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { UpdateContentConfigDto } from './dto/update-content-config.dto';
import { ContentJobResponseDto } from './dto/content-job-response.dto';

// ---------------------------------------------------------------------------
// Terminal job statuses — SSE status stream completes when any of these is reached
// ---------------------------------------------------------------------------

/** Job statuses that mean no further progress will occur. */
const TERMINAL_JOB_STATUSES = new Set(['DONE', 'FAILED', 'CANCELLED']);

/** Milliseconds between SSE status poll cycles. */
const SSE_POLL_INTERVAL_MS = 2_000;

/** Milliseconds between SSE heartbeat ticks (keeps the HTTP/2 connection alive). */
const SSE_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * ContentController — REST + SSE HTTP layer for the Content Creator pipeline.
 *
 * All routes require a valid JWT access token. Multi-tenant isolation is
 * enforced at the service layer — every service method accepts a `userId`
 * parameter extracted from `req.user.id`.
 *
 * Route groups:
 *  - `/content/jobs`           — Job CRUD + SSE step progress stream
 *  - `/content/jobs/:id/pieces` — Piece read + update + activate + variation
 *  - `/content/jobs/:id/chat`  — SSE streaming chat for job/piece refinement
 *  - `/content/config`         — Per-user content configuration
 *  - `/content/voice`          — Creator voice profile management
 */
@ApiTags('Content')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentController {
  constructor(
    private readonly contentJobsService: ContentJobsService,
    private readonly contentPiecesService: ContentPiecesService,
    private readonly contentChatService: ContentChatService,
    private readonly contentConfigService: ContentConfigService,
  ) {}

  // -------------------------------------------------------------------------
  // JOBS — CRUD
  // -------------------------------------------------------------------------

  /**
   * Creates a new content generation job.
   *
   * Persists the job with status=QUEUED and publishes it to the `kms.content`
   * RabbitMQ queue. The worker picks it up and drives it through the ingestion,
   * extraction, and generation steps.
   *
   * @param dto - Validated job creation payload.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The newly created job serialised as ContentJobResponseDto.
   * @throws AppError KBCNT0012 when RabbitMQ publish fails.
   */
  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new content generation job' })
  @ApiResponse({ status: 201, description: 'Job created and queued', type: ContentJobResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error (missing sourceUrl/sourceFileId)' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 503, description: 'RabbitMQ publish failed (KBCNT0012)' })
  async createJob(
    @Body() dto: CreateContentJobDto,
    @Req() req: any,
  ): Promise<ContentJobResponseDto> {
    return this.contentJobsService.createJob(dto, req.user.id);
  }

  /**
   * Lists content generation jobs for the authenticated user.
   *
   * Supports optional filtering by `status` and `sourceType`, plus cursor-based
   * pagination. Always scoped to the requesting user — other users' jobs are
   * never returned regardless of filter values.
   *
   * @param query - Optional filters and pagination params.
   * @param req   - Fastify request carrying `req.user.id`.
   * @returns `{ items, total, nextCursor }` page of jobs.
   */
  @Get('jobs')
  @ApiOperation({ summary: 'List content jobs with optional filters and cursor pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of content jobs' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listJobs(
    @Query() query: ListContentJobsQueryDto,
    @Req() req: any,
  ): Promise<{ items: ContentJobResponseDto[]; total: number; nextCursor: string | null }> {
    return this.contentJobsService.listJobs(query, req.user.id);
  }

  /**
   * Returns a single content job by its UUID.
   *
   * Verifies ownership: if the job belongs to another user, 403 is returned.
   * Returns 404 when the job does not exist.
   *
   * @param id  - Content job UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The job with nested pieces, serialised as ContentJobResponseDto.
   * @throws AppError KBCNT0001 (404) when the job does not exist.
   * @throws ForbiddenException (403) when the job belongs to another user.
   */
  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get a single content job by UUID' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 200, description: 'Content job retrieved', type: ContentJobResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async getJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<ContentJobResponseDto> {
    return this.contentJobsService.getJob(id, req.user.id);
  }

  /**
   * Deletes a content job and all its associated pieces.
   *
   * Returns 204 No Content on success. Returns 403 if the job belongs to
   * another user. Returns 404 if the job does not exist.
   *
   * @param id  - Content job UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   */
  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content job and all its pieces' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 204, description: 'Job deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async deleteJob(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<void> {
    return this.contentJobsService.deleteJob(id, req.user.id);
  }

  // -------------------------------------------------------------------------
  // JOBS — SSE STEP PROGRESS
  // -------------------------------------------------------------------------

  /**
   * SSE stream that emits step progress updates for a content job.
   *
   * The observable polls the job status every 2 seconds and emits:
   *   - `{ data: JSON.stringify({ steps, status }) }` on each poll
   *   - `{ data: JSON.stringify({ heartbeat: true }) }` every 30 seconds
   *   - Completes when the job reaches a terminal status (DONE/FAILED/CANCELLED)
   *
   * The caller should listen until the stream closes (EventSource `readyState`
   * becomes CLOSED) or until `status` is terminal.
   *
   * @param jobId - Content job UUID from the route parameter.
   * @param req   - Fastify request carrying `req.user.id`.
   * @returns Observable<MessageEvent> emitting job progress events.
   */
  @Sse('jobs/:id/status')
  @ApiOperation({ summary: 'SSE stream of step progress for a content job' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 200, description: 'SSE event stream — emits { steps, status } every 2s' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  streamJobStatus(
    @Param('id', ParseUUIDPipe) jobId: string,
    @Req() req: any,
  ): Observable<MessageEvent> {
    const userId = req.user.id as string;

    // Poll every SSE_POLL_INTERVAL_MS; `startWith(0)` fires the first event immediately
    // so the client does not wait the full interval for the initial state.
    return interval(SSE_POLL_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(async (tick: number) => {
        // Every ~15 ticks (~30s) we inject a heartbeat event instead of a DB poll.
        // This prevents proxies and load balancers from closing idle SSE connections.
        if (tick > 0 && tick % Math.floor(SSE_HEARTBEAT_INTERVAL_MS / SSE_POLL_INTERVAL_MS) === 0) {
          return { data: JSON.stringify({ heartbeat: true }) } as unknown as MessageEvent;
        }

        // Fetch the current job state — ownership verified by the service (403 if mismatch)
        const job = await this.contentJobsService.getJob(jobId, userId);
        return {
          data: JSON.stringify({ steps: job.stepsJson, status: job.status }),
        } as unknown as MessageEvent;
      }),
      // Terminate the stream once the job reaches a terminal status.
      // `takeWhile` with `inclusive: true` emits the final terminal event before completing,
      // so the client sees the DONE/FAILED/CANCELLED status before the stream closes.
      takeWhile((event: any) => {
        try {
          const parsed = JSON.parse(event.data as string);
          // Heartbeat events do not carry `status` — treat as non-terminal
          if (parsed.heartbeat) return true;
          // Continue (inclusive: emit this then stop) if status is terminal
          return !TERMINAL_JOB_STATUSES.has(parsed.status);
        } catch {
          // If the data can't be parsed, keep the stream alive
          return true;
        }
      }, true),
    );
  }

  // -------------------------------------------------------------------------
  // PIECES
  // -------------------------------------------------------------------------

  /**
   * Returns all content pieces for a job.
   *
   * Ownership is verified — returns 403 for another user's job and 404 if
   * the job does not exist.
   *
   * @param id  - Content job UUID.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Array of content pieces.
   */
  @Get('jobs/:id/pieces')
  @ApiOperation({ summary: 'List all content pieces for a job' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 200, description: 'Content pieces retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async listPieces(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<object[]> {
    return this.contentPiecesService.getPiecesForJob(id, req.user.id);
  }

  /**
   * Returns all content pieces for a specific platform within a job.
   *
   * Active variations are sorted first so the caller can trivially take
   * `result[0]` to get the currently selected variation.
   *
   * @param id       - Content job UUID.
   * @param platform - Platform name (e.g. 'linkedin', 'blog').
   * @param req      - Fastify request carrying `req.user.id`.
   * @returns Array of pieces for the platform, active variations first.
   */
  @Get('jobs/:id/pieces/:platform')
  @ApiOperation({ summary: 'Get pieces for a specific platform within a job' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'platform', type: String, description: 'Platform name (e.g. linkedin)' })
  @ApiResponse({ status: 200, description: 'Platform pieces retrieved, active variation first' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async getPlatformPieces(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('platform') platform: string,
    @Req() req: any,
  ): Promise<object[]> {
    return this.contentPiecesService.getPiecesForPlatform(id, platform, req.user.id);
  }

  /**
   * Updates the content text of a specific content piece.
   *
   * Implements optimistic locking: the client must send the current `version`
   * number from the DB. If there is a mismatch, 409 Conflict is returned and
   * the client should re-fetch the piece and retry.
   *
   * @param id      - Content job UUID (for routing context; not used by service directly).
   * @param pieceId - Content piece UUID.
   * @param dto     - Update payload including new content and current version.
   * @param req     - Fastify request carrying `req.user.id`.
   * @returns The updated content piece record.
   */
  @Put('jobs/:id/pieces/:pieceId')
  @ApiOperation({ summary: 'Update content text of a piece (optimistic locking via version)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'pieceId', type: String, description: 'Content piece UUID' })
  @ApiResponse({ status: 200, description: 'Piece updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — piece belongs to another user' })
  @ApiResponse({ status: 404, description: 'Piece not found (KBCNT0005)' })
  @ApiResponse({ status: 409, description: 'Version conflict — re-fetch and retry' })
  async updatePiece(
    @Param('id', ParseUUIDPipe) _id: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Body() dto: UpdateContentPieceDto,
    @Req() req: any,
  ): Promise<object> {
    // Note: _id (jobId) is available for future routing needs but the service uses
    // the pieceId to look up ownership via the piece→job relationship.
    return this.contentPiecesService.updatePiece(pieceId, dto, req.user.id);
  }

  /**
   * Sets a specific variation as the active one for its platform+format combination.
   *
   * Uses a DB transaction to atomically deactivate all other variations for the
   * same (jobId, platform, format) triple before activating the target.
   *
   * Returns the updated list of pieces for the job so the client can update its
   * local state in a single round-trip.
   *
   * @param id      - Content job UUID.
   * @param pieceId - UUID of the variation to activate.
   * @param req     - Fastify request carrying `req.user.id`.
   * @returns Updated array of all content pieces for the job.
   */
  @Patch('jobs/:id/pieces/:pieceId/activate')
  @ApiOperation({ summary: 'Set a variation as the active one for its platform+format' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'pieceId', type: String, description: 'Content piece UUID to activate' })
  @ApiResponse({ status: 200, description: 'Variation activated — returns updated pieces list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — piece belongs to another user' })
  @ApiResponse({ status: 404, description: 'Piece not found (KBCNT0005)' })
  async setActiveVariation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Req() req: any,
  ): Promise<{ pieces: object[] }> {
    await this.contentPiecesService.setActiveVariation(pieceId, id, req.user.id);
    // Return the refreshed pieces list so the UI can update in one round-trip
    const pieces = await this.contentPiecesService.getPiecesForJob(id, req.user.id);
    return { pieces };
  }

  /**
   * Requests an additional content variation for a specific platform.
   *
   * Publishes a single-platform message to the `kms.content` queue. The worker
   * creates a new `ContentPiece` at the next available `variationIndex`.
   * Maximum 5 variations per platform — returns 422 if the limit is reached.
   *
   * @param id       - Content job UUID.
   * @param platform - Target platform name (e.g. 'linkedin').
   * @param dto      - Optional instruction override for the variation prompt.
   * @param req      - Fastify request carrying `req.user.id`.
   */
  @Post('jobs/:id/pieces/:platform/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Generate an additional variation for a platform (async, 202)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'platform', type: String, description: 'Target platform (e.g. linkedin)' })
  @ApiResponse({ status: 202, description: 'Variation request accepted and queued' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  @ApiResponse({ status: 422, description: 'Variation limit exceeded (KBCNT0009)' })
  async generateVariation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('platform') platform: string,
    @Body() dto: GenerateVariationDto,
    @Req() req: any,
  ): Promise<{ accepted: true }> {
    await this.contentPiecesService.generateVariation(id, platform, dto, req.user.id);
    return { accepted: true };
  }

  /**
   * Retry platform content generation for a job.
   *
   * Publishes a platform-scoped retry message to the `kms.content` queue.
   * This is equivalent to `generateVariation` but is semantically a "retry"
   * of the primary variation (variationIndex = 0) rather than a new variation.
   *
   * @param id       - Content job UUID.
   * @param platform - Target platform name (e.g. 'linkedin').
   * @param req      - Fastify request carrying `req.user.id`.
   */
  @Post('jobs/:id/pieces/:platform/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry platform content generation (re-run the primary variation)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'platform', type: String, description: 'Target platform to retry' })
  @ApiResponse({ status: 202, description: 'Retry accepted and queued' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async retryPlatform(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('platform') platform: string,
    @Req() req: any,
  ): Promise<{ accepted: true }> {
    // A retry uses an empty GenerateVariationDto — no instruction override
    await this.contentPiecesService.generateVariation(id, platform, {}, req.user.id);
    return { accepted: true };
  }

  // -------------------------------------------------------------------------
  // CHAT — SSE streaming + history
  // -------------------------------------------------------------------------

  /**
   * Opens a POST SSE stream for job-level chat with the content editing assistant.
   *
   * Uses `@Post` + manual SSE framing rather than `@Sse` (GET) because the browser
   * native `EventSource` API does not support sending a request body. The frontend
   * MUST use `fetch()` with streaming mode — NOT `EventSource`.
   *
   * Example client usage:
   * ```js
   * const res = await fetch('/api/content/jobs/:id/chat', {
   *   method: 'POST',
   *   headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ...' },
   *   body: JSON.stringify({ message }),
   * });
   * const reader = res.body.getReader();
   * // decode SSE frames: "data: <chunk>\n\n"
   * ```
   *
   * Each SSE event carries a text chunk from Claude. The stream ends with
   * `data: [DONE]\n\n` or `data: [ERROR] <message>\n\n` on failure.
   *
   * `X-Accel-Buffering: no` prevents nginx from buffering the stream.
   *
   * @param jobId - Content job UUID (route param).
   * @param dto   - Chat message payload (max 4000 chars).
   * @param req   - Fastify request carrying `req.user.id`.
   * @param res   - Fastify raw reply used to manually write SSE frames.
   */
  @Post('jobs/:id/chat')
  @ApiOperation({ summary: 'Stream chat response via SSE (POST — use fetch, not EventSource)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 200, description: 'SSE stream of chat chunks; Content-Type: text/event-stream' })
  @ApiResponse({ status: 400, description: 'Validation error (message too long)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async sendChatMessage(
    @Param('id', ParseUUIDPipe) jobId: string,
    @Body() dto: SendChatMessageDto,
    @Req() req: any,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const userId = req.user.id as string;

    // Set SSE response headers — must be written before any body data.
    // X-Accel-Buffering: no tells nginx not to buffer the stream, ensuring
    // chunks reach the client immediately as they are written.
    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // streamChat is an AsyncGenerator — iterate it and write each chunk as
      // an SSE data frame. Each frame is terminated with double newline per
      // the SSE spec (https://html.spec.whatwg.org/multipage/server-sent-events.html).
      const gen = this.contentChatService.streamChat(jobId, null, dto.message, userId);
      for await (const chunk of gen) {
        res.raw.write(`data: ${chunk}\n\n`);
      }
    } catch (err: unknown) {
      // Surface errors to the client as a final SSE error frame so the consumer
      // can distinguish a clean [DONE] from a generation failure without needing
      // to inspect the HTTP status code (which is already 200 at this point).
      const msg = err instanceof Error ? err.message : 'Generation failed';
      res.raw.write(`data: [ERROR] ${msg}\n\n`);
    }

    // Close the HTTP response — signals end-of-stream to the client.
    res.raw.end();
  }

  /**
   * Opens a POST SSE stream for piece-level chat with the content editing assistant.
   *
   * Identical in streaming mechanics to `sendChatMessage` but scoped to a
   * specific content piece. The piece content is included in the Claude context
   * so the assistant can suggest targeted edits to a particular platform output.
   *
   * The frontend MUST use `fetch()` with streaming mode — NOT `EventSource`.
   * See `sendChatMessage` JSDoc for the required client pattern.
   *
   * `X-Accel-Buffering: no` prevents nginx from buffering the stream.
   *
   * @param jobId   - Content job UUID (route param).
   * @param pieceId - Content piece UUID to scope the chat to.
   * @param dto     - Chat message payload (max 4000 chars).
   * @param req     - Fastify request carrying `req.user.id`.
   * @param res     - Fastify raw reply used to manually write SSE frames.
   */
  @Post('jobs/:id/chat/:pieceId')
  @ApiOperation({ summary: 'Stream piece-scoped chat response via SSE (POST — use fetch, not EventSource)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'pieceId', type: String, description: 'Content piece UUID' })
  @ApiResponse({ status: 200, description: 'SSE stream of chat chunks; Content-Type: text/event-stream' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job or piece not found' })
  async sendPieceChatMessage(
    @Param('id', ParseUUIDPipe) jobId: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Body() dto: SendChatMessageDto,
    @Req() req: any,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const userId = req.user.id as string;

    // Set SSE response headers — identical to job-level chat.
    // X-Accel-Buffering: no prevents nginx from buffering the chunked stream.
    res.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      // Stream the piece-scoped chat — pieceId narrows Claude's context to the
      // specific platform output the user wants to refine.
      const gen = this.contentChatService.streamChat(jobId, pieceId, dto.message, userId);
      for await (const chunk of gen) {
        res.raw.write(`data: ${chunk}\n\n`);
      }
    } catch (err: unknown) {
      // Surface error as a final SSE frame so the client can display it.
      const msg = err instanceof Error ? err.message : 'Generation failed';
      res.raw.write(`data: [ERROR] ${msg}\n\n`);
    }

    // Terminate the HTTP response to signal end-of-stream to the client.
    res.raw.end();
  }

  /**
   * Returns chat history for a job (job-level messages, no specific piece).
   *
   * Messages are returned in chronological order (oldest first) for display.
   * Job ownership is verified before returning any messages.
   *
   * @param id  - Content job UUID.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Array of ContentChatMessage records.
   */
  @Get('jobs/:id/chat')
  @ApiOperation({ summary: 'Get job-level chat history (chronological, oldest first)' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiResponse({ status: 200, description: 'Chat history retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async getChatHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
  ): Promise<object[]> {
    return this.contentChatService.getChatHistory(id, null, req.user.id);
  }

  /**
   * Returns chat history scoped to a specific content piece.
   *
   * @param id      - Content job UUID.
   * @param pieceId - Content piece UUID.
   * @param req     - Fastify request carrying `req.user.id`.
   * @returns Array of piece-scoped ContentChatMessage records.
   */
  @Get('jobs/:id/chat/:pieceId')
  @ApiOperation({ summary: 'Get chat history for a specific content piece' })
  @ApiParam({ name: 'id', type: String, description: 'Content job UUID' })
  @ApiParam({ name: 'pieceId', type: String, description: 'Content piece UUID' })
  @ApiResponse({ status: 200, description: 'Piece chat history retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — job belongs to another user' })
  @ApiResponse({ status: 404, description: 'Job not found (KBCNT0001)' })
  async getPieceChatHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pieceId', ParseUUIDPipe) pieceId: string,
    @Req() req: any,
  ): Promise<object[]> {
    return this.contentChatService.getChatHistory(id, pieceId, req.user.id);
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------

  /**
   * Returns the authenticated user's content creator configuration.
   *
   * Uses an upsert-on-read pattern: if the user has never saved a configuration,
   * a row with sensible defaults is created and returned. The caller always
   * receives a fully-formed `ContentConfiguration` object.
   *
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The user's ContentConfiguration record.
   */
  @Get('config')
  @ApiOperation({ summary: "Get the user's content creator configuration (defaults created on first read)" })
  @ApiResponse({ status: 200, description: 'Configuration retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getConfig(@Req() req: any): Promise<object> {
    return this.contentConfigService.getConfig(req.user.id);
  }

  /**
   * Updates the authenticated user's content creator configuration.
   *
   * All fields are optional — only provided fields are updated.
   * The Hashnode API key is encrypted (AES-256-GCM) before storage.
   *
   * @param dto - Partial update payload.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The updated ContentConfiguration record.
   * @throws AppError KBCNT0006 when `platformConfig` contains invalid entries.
   */
  @Put('config')
  @ApiOperation({ summary: "Update the user's content creator configuration" })
  @ApiResponse({ status: 200, description: 'Configuration updated' })
  @ApiResponse({ status: 400, description: 'Invalid platform configuration (KBCNT0006)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateConfig(
    @Body() dto: UpdateContentConfigDto,
    @Req() req: any,
  ): Promise<object> {
    return this.contentConfigService.updateConfig(req.user.id, dto);
  }

  // -------------------------------------------------------------------------
  // VOICE PROFILE
  // -------------------------------------------------------------------------

  /**
   * Returns the authenticated user's creator voice profile.
   *
   * Returns 404 when the user has not yet created a voice profile. The client
   * can use this to determine whether to show the onboarding prompt.
   *
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The CreatorVoiceProfile record.
   * @throws NotFoundException (404) when no voice profile exists.
   */
  @Get('voice')
  @ApiOperation({ summary: "Get the user's creator voice profile (404 if not yet created)" })
  @ApiResponse({ status: 200, description: 'Voice profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Voice profile not yet configured' })
  async getVoiceProfile(@Req() req: any): Promise<object> {
    const profile = await this.contentConfigService.getVoiceProfile(req.user.id);
    if (!profile) {
      // Raise a standard NestJS NotFoundException so the global error filter
      // formats the 404 consistently with the rest of the API.
      throw new NotFoundException('Voice profile not yet configured for this user');
    }
    return profile;
  }

  /**
   * Creates or replaces the authenticated user's creator voice profile.
   *
   * The `profileText` must be at least 100 characters to ensure it contains
   * enough style/tone detail to be useful to Claude during content generation.
   *
   * @param body - Object containing `profileText` string.
   * @param req  - Fastify request carrying `req.user.id`.
   * @returns The created-or-updated CreatorVoiceProfile record.
   * @throws AppError KBCNT0007 (400) when `profileText` is shorter than 100 chars.
   */
  @Put('voice')
  @ApiOperation({ summary: "Create or replace the user's creator voice profile" })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['profileText'],
      properties: {
        profileText: {
          type: 'string',
          minLength: 100,
          description: 'Writing style / tone description (min 100 chars)',
          example: 'I write conversational technical posts aimed at senior engineers. ' +
            'My tone is direct but friendly. I use short sentences and avoid jargon. ' +
            'I include practical code examples and real-world trade-offs.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Voice profile saved' })
  @ApiResponse({ status: 400, description: 'profileText too short (KBCNT0007) or missing' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async upsertVoiceProfile(
    @Body() body: { profileText: string },
    @Req() req: any,
  ): Promise<object> {
    return this.contentConfigService.upsertVoiceProfile(req.user.id, body.profileText);
  }
}
