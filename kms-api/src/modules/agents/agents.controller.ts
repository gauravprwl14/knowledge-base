import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { AgentsService, CreateRunDto } from './agents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * AgentsController exposes ACP (Agent Communication Protocol) REST endpoints
 * that proxy to the `rag-service` Python FastAPI microservice (port 8002).
 *
 * ACP run lifecycle:
 * 1. `POST  /chat/runs`              — create a run, receive `runId`
 * 2. `GET   /chat/runs/:runId`       — poll status
 * 3. `GET   /chat/runs/:runId/stream`— SSE token stream (open-ended)
 * 4. `DELETE /chat/runs/:runId`      — cancel in-progress run
 *
 * All routes require a valid JWT access token.
 */
@ApiTags('Agents')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('chat/runs')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  /**
   * Creates a new agent run and returns its ID.
   *
   * @param body - Run creation payload containing the user message.
   * @returns The newly created run object from the rag-service.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Start a new agent (RAG) run' })
  @ApiResponse({ status: 201, description: 'Run created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 502, description: 'RAG service unavailable' })
  createRun(@Body() body: CreateRunDto) {
    return this.agentsService.createRun(body);
  }

  /**
   * Polls the status and metadata of an existing agent run.
   *
   * @param runId - The ACP run ID returned from `POST /chat/runs`.
   * @returns Current run status and metadata.
   */
  @Get(':runId')
  @ApiOperation({ summary: 'Get agent run status' })
  @ApiParam({ name: 'runId', type: String, description: 'ACP run ID' })
  @ApiResponse({ status: 200, description: 'Run retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getRun(@Param('runId') runId: string) {
    return this.agentsService.getRun(runId);
  }

  /**
   * Opens a Server-Sent Events stream for a run, forwarding tokens from the
   * rag-service in real time.
   *
   * Clients should connect with `Accept: text/event-stream` and handle the
   * `data:` lines. The stream closes when the run completes or errors.
   *
   * @param runId - The ACP run ID to stream.
   * @returns RxJS Observable emitting `MessageEvent` objects.
   */
  @Sse(':runId/stream')
  @ApiOperation({ summary: 'Stream agent run tokens via SSE' })
  @ApiParam({ name: 'runId', type: String, description: 'ACP run ID' })
  @ApiResponse({ status: 200, description: 'SSE stream opened' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  streamRun(@Param('runId') runId: string): Observable<MessageEvent> {
    return this.agentsService.streamRun(runId);
  }

  /**
   * Cancels an in-progress agent run.
   *
   * @param runId - The ACP run ID to cancel.
   */
  @Delete(':runId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an agent run' })
  @ApiParam({ name: 'runId', type: String, description: 'ACP run ID' })
  @ApiResponse({ status: 204, description: 'Run cancelled successfully' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  cancelRun(@Param('runId') runId: string) {
    return this.agentsService.cancelRun(runId);
  }
}
