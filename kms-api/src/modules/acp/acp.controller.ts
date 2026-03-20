import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { AcpService } from './acp.service';
import { ACP_TOOLS } from './acp-tool.registry';
import { InitializeAcpDto } from './dto/initialize-acp.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { PromptSessionDto } from './dto/prompt-session.dto';

/**
 * AcpController exposes the ACP (Agent Client Protocol) HTTP gateway.
 *
 * Endpoint lifecycle:
 * 1. POST  /acp/v1/initialize            — public handshake, returns capabilities
 * 2. POST  /acp/v1/sessions              — create session (JWT required)
 * 3. POST  /acp/v1/sessions/:id/prompt   — run prompt, SSE stream (JWT required)
 * 4. DELETE /acp/v1/sessions/:id         — close session (JWT required)
 */
@ApiTags('ACP')
@Controller('acp/v1')
export class AcpController {
  constructor(private readonly acpService: AcpService) {}

  /**
   * ACP handshake endpoint. Returns supported protocol version and tool list.
   * Public — no authentication required. Rate-limited to 20 requests per minute
   * to prevent capability enumeration and abuse from unauthenticated callers.
   */
  @Post('initialize')
  @Public()
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ACP handshake — returns server capabilities' })
  @ApiResponse({ status: 200, description: 'Capabilities returned' })
  initialize(@Body() _dto: InitializeAcpDto): object {
    return {
      protocolVersion: 1,
      agentCapabilities: {
        tools: ACP_TOOLS,
      },
    };
  }

  /**
   * Creates a new ACP session for the authenticated user.
   * Rate-limited to 30 session-creation requests per minute per IP.
   */
  @Post('sessions')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new ACP session' })
  @ApiResponse({ status: 201, description: 'Session created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createSession(
    @Body() dto: CreateSessionDto,
    @Request() req: { user: { id: string } },
  ): Promise<{ sessionId: string }> {
    const session = await this.acpService.createSession(req.user.id, dto);
    return { sessionId: session.sessionId };
  }

  /**
   * Runs a prompt against the ACP pipeline and streams the response via SSE.
   *
   * Each SSE event is a JSON object: agent_message_chunk | tool_call_start |
   * tool_call_result | done | error.
   */
  @Sse('sessions/:id/prompt')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Run a prompt — SSE stream' })
  @ApiParam({ name: 'id', type: String, description: 'ACP session UUID' })
  @ApiResponse({ status: 200, description: 'SSE stream opened' })
  @ApiResponse({ status: 404, description: 'Session not found or expired' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  promptSession(
    @Param('id') sessionId: string,
    @Body() dto: PromptSessionDto,
    @Request() req: { user: { id: string } },
  ): Observable<MessageEvent> {
    return this.acpService.runPrompt(sessionId, dto, req.user.id);
  }

  /**
   * Closes an ACP session and removes it from Redis.
   */
  @Delete('sessions/:id')
  @ApiBearerAuth('jwt')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close an ACP session' })
  @ApiParam({ name: 'id', type: String, description: 'ACP session UUID' })
  @ApiResponse({ status: 204, description: 'Session closed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async closeSession(@Param('id') sessionId: string): Promise<void> {
    return this.acpService.closeSession(sessionId);
  }
}
