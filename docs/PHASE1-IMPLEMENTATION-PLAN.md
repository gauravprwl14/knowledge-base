# Phase 1 Implementation Plan: ACP Gateway + Claude Integration

**Date**: 2026-03-17
**Author**: Architecture
**Status**: Ready to Implement
**Relates to**: ADR-007 (ACP Agent Protocol)

---

## Overview

Phase 1 builds the minimum viable ACP integration so that an ACP-compatible client (Claude Code, Zed, curl) can connect to KMS, call `kms_search` to retrieve relevant knowledge, and receive a Claude-generated answer grounded in real documents — all via SSE streaming.

This plan is self-contained. A developer can pick it up and implement without further questions.

**What is built in Phase 1**:
- ACP gateway module inside `kms-api` (4 endpoints)
- Redis-backed session store
- `kms_search` tool (the only tool)
- Anthropic SDK adapter for streaming
- Docker Compose env wiring

**What is NOT built in Phase 1**:
- WorkflowEngine or sub-agents
- `kms_retrieve` or `kms_graph_expand` tools
- Frontend chat UI
- MCP server
- Tiered retrieval / query classifier
- YouTube ingestion

---

## Architecture

```
ACP Client (Zed / curl / Claude Code)
    │
    │  HTTP (ACP over HTTP transport)
    │
    ▼
kms-api  POST /acp/v1/initialize
         POST /acp/v1/sessions
         POST /acp/v1/sessions/:id/prompt   ← SSE stream
         DELETE /acp/v1/sessions/:id
    │
    │  AcpService
    │
    ├──► AcpSessionStore (Redis)
    │      key: kms:acp:session:{sessionId}
    │      TTL: 3600s
    │
    ├──► AcpToolRegistry
    │      └── kms_search(query, mode, limit)
    │               │
    │               ▼
    │          GET http://search-api:8001/search
    │          header: x-user-id: {userId}
    │
    └──► AnthropicAdapter
           system: KMS context prompt
           user: [search results as context blocks] + question
           stream: text/event-stream → SSE MessageEvents
```

---

## 1. Pre-Conditions

The following must be true before starting implementation:

| Requirement | Check |
|-------------|-------|
| `search-api` is running on port 8001 | `curl http://localhost:8001/search?q=test` returns JSON |
| Redis is running on port 6379 | Already wired in `CacheModule` (ioredis) |
| `ANTHROPIC_API_KEY` is in `.env` | Must start with `sk-ant-` |
| PostgreSQL is running | Already required by `kms-api` |
| `kms-api` is running on port 8000 | `curl http://localhost:8000/health` returns 200 |

The `CacheModule` is already `@Global()` and exports `REDIS_CLIENT` (ioredis) and `CacheService`. The ACP session store will inject `CacheService` directly — no new Redis wiring needed.

The `SearchService` in `kms-api/src/modules/search/search.service.ts` already proxies to search-api using `SEARCH_API_URL` env var. The ACP tool will replicate this pattern but forward `x-user-id` from the session.

---

## 2. Files to Create

All files live under `kms-api/src/modules/acp/`.

```
kms-api/src/modules/acp/
├── acp.module.ts
├── acp.controller.ts
├── acp.service.ts
├── acp-session.store.ts
├── acp-tool.registry.ts
├── acp-event.emitter.ts
├── external-agent/
│   ├── anthropic.adapter.ts
│   └── external-agent.types.ts
└── dto/
    ├── initialize-acp.dto.ts
    ├── create-session.dto.ts
    └── prompt-session.dto.ts
```

One file to modify:

```
kms-api/src/app.module.ts   ← add AcpModule to imports array
```

---

## 3. New Error Codes

Add two entries to `kms-api/src/errors/error-codes/index.ts` inside `EXT_ERROR_CODES`:

```typescript
ACP_SESSION_NOT_FOUND: {
  code: 'EXT0012',
  message: 'ACP session not found or expired',
  httpStatus: 404,
  severity: 'WARNING',
  retryable: false,
  userFacing: true,
},
ANTHROPIC_ERROR: {
  code: 'EXT0013',
  message: 'Anthropic API error',
  httpStatus: 502,
  severity: 'ERROR',
  retryable: true,
  userFacing: true,
},
```

---

## 4. DTOs

### `dto/initialize-acp.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ClientInfoDto {
  @ApiProperty({ example: 'claude-code' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  version!: string;
}

export class InitializeAcpDto {
  @ApiProperty({ description: 'ACP protocol version', example: 1 })
  @IsNumber()
  protocolVersion!: number;

  @ApiPropertyOptional({ type: ClientInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInfoDto)
  clientInfo?: ClientInfoDto;
}
```

### `dto/create-session.dto.ts`

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({
    description: 'Working directory hint from the client',
    example: '/Users/dev/my-project',
  })
  @IsOptional()
  @IsString()
  cwd?: string;
}
```

### `dto/prompt-session.dto.ts`

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PromptPartDto {
  @ApiProperty({ enum: ['text'], example: 'text' })
  @IsEnum(['text'])
  type!: 'text';

  @ApiProperty({ example: 'What embedding model does this project use?' })
  @IsString()
  text!: string;
}

export class PromptSessionDto {
  @ApiProperty({ type: [PromptPartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptPartDto)
  prompt!: PromptPartDto[];
}
```

---

## 5. External Agent Types

### `external-agent/external-agent.types.ts`

```typescript
/** A single search result chunk returned by kms_search. */
export interface KmsSearchResult {
  fileId: string;
  filename: string;
  snippet: string;
  score: number;
  chunkIndex: number;
  sourceId: string;
}

/** Response envelope from kms_search tool. */
export interface KmsSearchResponse {
  results: KmsSearchResult[];
  total: number;
  took_ms: number;
  mode: string;
}

/** ACP SSE event types emitted during a prompt run. */
export type AcpEventType =
  | 'agent_message_chunk'
  | 'tool_call_start'
  | 'tool_call_result'
  | 'done'
  | 'error';

/** Shape of an ACP SSE event payload. */
export interface AcpEvent {
  type: AcpEventType;
  data: unknown;
}

/** Anthropic message role. */
export type AnthropicRole = 'user' | 'assistant';

/** Single message for Anthropic messages array. */
export interface AnthropicMessage {
  role: AnthropicRole;
  content: string;
}
```

---

## 6. ACP Session Store

### `acp-session.store.ts`

The session store wraps `CacheService` (already global). Key pattern: `kms:acp:session:{sessionId}`. TTL default: 3600 seconds (configurable via `ACP_SESSION_TTL_SECONDS` env var).

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../cache/cache.service';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { v4 as uuidv4 } from 'uuid';

/** Persisted data for an ACP session. */
export interface AcpSession {
  sessionId: string;
  userId: string;
  createdAt: string;
  lastTouchedAt: string;
  cwd?: string;
}

const SESSION_KEY_PREFIX = 'kms:acp:session:';

/**
 * AcpSessionStore manages ACP sessions in Redis.
 *
 * Sessions are stored as JSON hashes with a configurable TTL.
 * Every read call touches the TTL (sliding window expiry).
 */
@Injectable()
export class AcpSessionStore {
  private readonly logger: AppLogger;
  private readonly ttlSeconds: number;

  constructor(
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpSessionStore.name });
    this.ttlSeconds = parseInt(
      this.config.get<string>('ACP_SESSION_TTL_SECONDS') ?? '3600',
      10,
    );
  }

  /**
   * Creates a new session for the given user and returns the session ID.
   *
   * @param userId - Authenticated user's UUID from JwtAuthGuard.
   * @param cwd - Optional working directory hint from the client.
   * @returns The newly created AcpSession.
   */
  async create(userId: string, cwd?: string): Promise<AcpSession> {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const session: AcpSession = {
      sessionId,
      userId,
      createdAt: now,
      lastTouchedAt: now,
      cwd,
    };

    await this.cache.set(this.key(sessionId), session, this.ttlSeconds);
    this.logger.info('ACP session created', { sessionId, userId });
    return session;
  }

  /**
   * Retrieves a session by ID and resets its TTL.
   * Throws EXT0012 if the session does not exist or has expired.
   *
   * @param sessionId - The session UUID.
   * @returns The AcpSession.
   */
  async get(sessionId: string): Promise<AcpSession> {
    const session = await this.cache.get<AcpSession>(this.key(sessionId));
    if (!session) {
      throw new AppError({
        code: ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND.code,
        message: `ACP session ${sessionId} not found or expired`,
      });
    }

    // Slide the TTL on every access
    session.lastTouchedAt = new Date().toISOString();
    await this.cache.set(this.key(sessionId), session, this.ttlSeconds);
    return session;
  }

  /**
   * Deletes a session from Redis.
   *
   * @param sessionId - The session UUID to delete.
   */
  async delete(sessionId: string): Promise<void> {
    await this.cache.del(this.key(sessionId));
    this.logger.info('ACP session deleted', { sessionId });
  }

  private key(sessionId: string): string {
    return `${SESSION_KEY_PREFIX}${sessionId}`;
  }
}
```

> Note: `ERROR_CODES.EXT.ACP_SESSION_NOT_FOUND` requires the new error code added in Section 3 above.

---

## 7. ACP Tool Registry

### `acp-tool.registry.ts`

The registry holds the single Phase 1 tool: `kms_search`. It calls search-api directly (same pattern as `kms-api/src/modules/search/search.service.ts`) and forwards `x-user-id` so search-api can scope results to the authenticated user.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { KmsSearchResponse } from './external-agent/external-agent.types';

/** Tool descriptor returned in the /initialize response. */
export const ACP_TOOLS = [
  {
    name: 'kms_search',
    description: 'Search the KMS knowledge base. Returns up to `limit` ranked chunks.',
    parameters: {
      query: { type: 'string', description: 'The search query' },
      mode: {
        type: 'string',
        enum: ['keyword', 'semantic', 'hybrid'],
        default: 'hybrid',
        description: 'Search strategy',
      },
      limit: {
        type: 'number',
        default: 5,
        description: 'Maximum number of results (1–20)',
      },
    },
  },
];

/**
 * AcpToolRegistry provides the implementation for each registered ACP tool.
 *
 * Phase 1 exposes a single tool: kms_search.
 */
@Injectable()
export class AcpToolRegistry {
  private readonly logger: AppLogger;
  private readonly searchApiUrl: string;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpToolRegistry.name });
    this.searchApiUrl =
      this.config.get<string>('SEARCH_API_URL') ?? 'http://localhost:8001';
  }

  /**
   * Executes the kms_search tool.
   *
   * Calls GET /search on the search-api with the provided query, mode, and
   * limit parameters. Forwards userId via the x-user-id header so search-api
   * can scope results to the authenticated user's knowledge base.
   *
   * @param query - The search string.
   * @param userId - The authenticated user's UUID (from ACP session).
   * @param mode - Search strategy: keyword, semantic, or hybrid.
   * @param limit - Max number of results to return (capped at 20).
   * @returns KmsSearchResponse with ranked result chunks.
   * @throws AppError EXT0001 if search-api is unreachable.
   * @throws AppError EXT0004 if search-api returns a non-2xx response.
   */
  async kmsSearch(
    query: string,
    userId: string,
    mode: 'keyword' | 'semantic' | 'hybrid' = 'hybrid',
    limit = 5,
  ): Promise<KmsSearchResponse> {
    const cappedLimit = Math.min(Math.max(limit, 1), 20);
    const params = new URLSearchParams({
      q: query,
      mode,
      limit: String(cappedLimit),
    });

    const url = `${this.searchApiUrl}/search?${params.toString()}`;
    this.logger.info('kms_search tool executing', { url, mode, limit: cappedLimit, userId });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error('search-api unreachable from ACP tool', { error: (err as Error).message });
      throw new AppError({
        code: ERROR_CODES.EXT.SERVICE_UNAVAILABLE.code,
        message: 'Search service unavailable',
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: ERROR_CODES.EXT.INVALID_RESPONSE.code,
        message: `Search service returned HTTP ${response.status}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      });
    }

    return response.json() as Promise<KmsSearchResponse>;
  }
}
```

---

## 8. ACP Event Emitter

### `acp-event.emitter.ts`

A small helper that wraps an RxJS `Subject` and provides typed methods for emitting ACP SSE events. The controller's `@Sse` handler will subscribe to the Subject as an Observable.

```typescript
import { Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AcpEventType } from './external-agent/external-agent.types';

/**
 * AcpEventEmitter wraps a Subject<MessageEvent> and provides typed emit
 * methods for each ACP event type.
 *
 * Instantiated per-request inside AcpService.runPrompt().
 * The controller subscribes to subject.asObservable() via @Sse.
 */
export class AcpEventEmitter {
  readonly subject = new Subject<MessageEvent>();

  /** Emits a text token chunk from the LLM. */
  emitChunk(text: string): void {
    this.subject.next({
      data: JSON.stringify({ type: 'agent_message_chunk', data: { text } }),
    } as MessageEvent);
  }

  /** Emits a tool_call_start event (for observability/UI). */
  emitToolCallStart(toolName: string, args: Record<string, unknown>): void {
    this.subject.next({
      data: JSON.stringify({ type: 'tool_call_start', data: { tool: toolName, args } }),
    } as MessageEvent);
  }

  /** Emits a tool_call_result event (for observability/UI). */
  emitToolCallResult(toolName: string, resultCount: number): void {
    this.subject.next({
      data: JSON.stringify({
        type: 'tool_call_result',
        data: { tool: toolName, resultCount },
      }),
    } as MessageEvent);
  }

  /** Emits the terminal done event and completes the Subject. */
  emitDone(): void {
    this.subject.next({
      data: JSON.stringify({ type: 'done', data: {} }),
    } as MessageEvent);
    this.subject.complete();
  }

  /** Emits an error event and completes the Subject. */
  emitError(message: string): void {
    this.subject.next({
      data: JSON.stringify({ type: 'error', data: { message } }),
    } as MessageEvent);
    this.subject.complete();
  }
}
```

---

## 9. Anthropic Adapter

### `external-agent/anthropic.adapter.ts`

Uses `@anthropic-ai/sdk` (to be installed — see Section 12). Reads `ANTHROPIC_API_KEY` from config. Builds the messages array: system prompt first, then context blocks from search results, then the user question. Streams tokens directly into an `AcpEventEmitter`.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import { AcpEventEmitter } from '../acp-event.emitter';
import { KmsSearchResult } from './external-agent.types';

/** The Claude model to use. Configurable via ANTHROPIC_MODEL env var. */
const DEFAULT_MODEL = 'claude-opus-4-5';

/** Max tokens to generate per response. */
const MAX_TOKENS = 2048;

/**
 * System prompt injected before every Claude call.
 * Instructs Claude to act as a KMS knowledge assistant and cite sources.
 */
const SYSTEM_PROMPT = `You are KMS Assistant, an AI that answers questions grounded in a personal knowledge base.

Rules:
1. Answer only from the provided context chunks. If context is insufficient, say so clearly.
2. Always cite sources by filename when quoting or paraphrasing.
3. Be concise. Prefer bullet points for lists of facts.
4. Never hallucinate facts not present in the context.
5. If no context was found, say "I couldn't find relevant information in the knowledge base for this question."`;

/**
 * AnthropicAdapter wraps the Anthropic streaming SDK.
 *
 * For each prompt:
 * 1. Formats search results as a context block in the user message.
 * 2. Calls claude-opus-4-5 (or configured model) with streaming enabled.
 * 3. Pipes each text_delta event to the AcpEventEmitter.
 * 4. Calls emitter.emitDone() when the stream ends.
 */
@Injectable()
export class AnthropicAdapter {
  private readonly logger: AppLogger;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AnthropicAdapter.name });

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new AppError({
        code: ERROR_CODES.SRV.CONFIGURATION_ERROR.code,
        message: 'ANTHROPIC_API_KEY is not configured',
      });
    }

    this.client = new Anthropic({ apiKey });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  }

  /**
   * Streams a grounded answer from Claude for the given question.
   *
   * Context blocks are prepended to the user message so Claude can cite them.
   * If results array is empty, Claude is told no context was found.
   *
   * @param question - The user's question text.
   * @param results - Search results from kms_search tool.
   * @param emitter - AcpEventEmitter to pipe tokens into.
   */
  async streamAnswer(
    question: string,
    results: KmsSearchResult[],
    emitter: AcpEventEmitter,
  ): Promise<void> {
    const contextText =
      results.length === 0
        ? 'No relevant documents found in the knowledge base.'
        : results
            .map(
              (r, i) =>
                `[${i + 1}] File: ${r.filename} (score: ${r.score.toFixed(3)})\n${r.snippet}`,
            )
            .join('\n\n---\n\n');

    const userMessage = `Context from knowledge base:\n\n${contextText}\n\n---\n\nQuestion: ${question}`;

    this.logger.info('Streaming Claude response', {
      model: this.model,
      contextChunks: results.length,
      questionLength: question.length,
    });

    try {
      const stream = await this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          emitter.emitChunk(event.delta.text);
        }
      }

      emitter.emitDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anthropic API error';
      this.logger.error('Anthropic streaming error', { error: message });
      emitter.emitError(message);
      throw new AppError({
        code: ERROR_CODES.EXT.ANTHROPIC_ERROR.code,
        message: `Anthropic API error: ${message}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
  }
}
```

> Note: `ERROR_CODES.EXT.ANTHROPIC_ERROR` requires the new error code added in Section 3.

---

## 10. ACP Service

### `acp.service.ts`

Orchestrates the full prompt flow: get session → emit tool_call_start → call kms_search → emit tool_call_result → stream Claude answer.

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { AppLogger } from '../../logger/logger.service';
import { AcpSessionStore, AcpSession } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AcpEventEmitter } from './acp-event.emitter';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';
import { PromptSessionDto } from './dto/prompt-session.dto';
import { CreateSessionDto } from './dto/create-session.dto';

/**
 * AcpService orchestrates the prompt lifecycle:
 * 1. Validate session
 * 2. Extract question from prompt parts
 * 3. Call kms_search tool
 * 4. Stream grounded Claude response back via SSE
 */
@Injectable()
export class AcpService {
  private readonly logger: AppLogger;

  constructor(
    private readonly sessionStore: AcpSessionStore,
    private readonly toolRegistry: AcpToolRegistry,
    private readonly anthropicAdapter: AnthropicAdapter,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AcpService.name });
  }

  /**
   * Creates a new ACP session for the authenticated user.
   *
   * @param userId - The authenticated user's UUID.
   * @param dto - CreateSession payload (cwd hint).
   * @returns The created session object.
   */
  async createSession(userId: string, dto: CreateSessionDto): Promise<AcpSession> {
    return this.sessionStore.create(userId, dto.cwd);
  }

  /**
   * Closes an ACP session by deleting it from Redis.
   *
   * @param sessionId - Session UUID to delete.
   */
  async closeSession(sessionId: string): Promise<void> {
    return this.sessionStore.delete(sessionId);
  }

  /**
   * Runs the full prompt flow and returns an Observable<MessageEvent> for SSE.
   *
   * The Observable is hot: it starts immediately and the caller subscribes
   * via NestJS @Sse to forward events to the HTTP client.
   *
   * Flow:
   * 1. Get + validate session (throws 404 if not found / expired)
   * 2. Extract question text from prompt parts
   * 3. Emit tool_call_start
   * 4. Call kms_search tool
   * 5. Emit tool_call_result
   * 6. Stream Claude response (emits agent_message_chunk per token)
   * 7. Emit done / error
   *
   * @param sessionId - The session UUID from the route param.
   * @param dto - The prompt payload.
   * @returns RxJS Observable of SSE MessageEvents.
   */
  runPrompt(sessionId: string, dto: PromptSessionDto): Observable<MessageEvent> {
    const emitter = new AcpEventEmitter();

    // Start the async pipeline without awaiting — the Observable returned
    // immediately so the SSE connection is established before any I/O.
    this.executePromptPipeline(sessionId, dto, emitter).catch((err: Error) => {
      this.logger.error('Prompt pipeline error', { sessionId, error: err.message });
      emitter.emitError(err.message);
    });

    return emitter.subject.asObservable();
  }

  private async executePromptPipeline(
    sessionId: string,
    dto: PromptSessionDto,
    emitter: AcpEventEmitter,
  ): Promise<void> {
    // Step 1: validate session (throws AppError EXT0012 if not found)
    const session = await this.sessionStore.get(sessionId);

    // Step 2: extract question from prompt parts
    const question = dto.prompt
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join(' ')
      .trim();

    if (!question) {
      emitter.emitError('Prompt contains no text content');
      return;
    }

    this.logger.info('Executing ACP prompt pipeline', {
      sessionId,
      userId: session.userId,
      questionLength: question.length,
    });

    // Step 3+4: call kms_search
    emitter.emitToolCallStart('kms_search', { query: question, mode: 'hybrid', limit: 5 });

    const searchResponse = await this.toolRegistry.kmsSearch(
      question,
      session.userId,
      'hybrid',
      5,
    );

    emitter.emitToolCallResult('kms_search', searchResponse.results.length);

    this.logger.info('kms_search returned', {
      sessionId,
      resultCount: searchResponse.results.length,
      took_ms: searchResponse.took_ms,
    });

    // Step 5: stream Claude response
    await this.anthropicAdapter.streamAnswer(question, searchResponse.results, emitter);
  }
}
```

---

## 11. ACP Controller

### `acp.controller.ts`

Four endpoints. `initialize` is public (no JWT needed — it's the handshake). The other three require a valid JWT bearer token. The `prompt` endpoint uses `@Sse` and returns an `Observable<MessageEvent>`.

```typescript
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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { Public } from '../../common/decorators/public.decorator';
import { AcpService } from './acp.service';
import { ACP_TOOLS } from './acp-tool.registry';
import { InitializeAcpDto } from './dto/initialize-acp.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { PromptSessionDto } from './dto/prompt-session.dto';

/**
 * AcpController exposes the ACP (Agent Communication Protocol) HTTP gateway.
 *
 * Endpoint lifecycle:
 * 1. POST  /acp/v1/initialize         — public handshake, returns capabilities
 * 2. POST  /acp/v1/sessions           — create session (JWT required)
 * 3. POST  /acp/v1/sessions/:id/prompt— run prompt, SSE stream (JWT required)
 * 4. DELETE /acp/v1/sessions/:id      — close session (JWT required)
 */
@ApiTags('ACP')
@Controller('acp/v1')
export class AcpController {
  constructor(private readonly acpService: AcpService) {}

  /**
   * ACP handshake endpoint. Returns supported protocol version and tool list.
   * Public — no authentication required.
   *
   * @param dto - Client info and requested protocol version.
   * @returns ACP capabilities including the kms_search tool descriptor.
   */
  @Post('initialize')
  @Public()
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
   *
   * @param dto - Optional cwd hint from the client.
   * @param req - NestJS request object (user injected by JwtAuthGuard).
   * @returns The created session ID.
   */
  @Post('sessions')
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
   * Clients must connect with Accept: text/event-stream. Each SSE event is a
   * JSON object with a `type` field: agent_message_chunk | tool_call_start |
   * tool_call_result | done | error.
   *
   * The stream closes automatically when `done` or `error` is emitted.
   *
   * @param sessionId - The session UUID from the path.
   * @param dto - Prompt payload (array of text parts).
   * @returns RxJS Observable of SSE MessageEvents.
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
  ): Observable<MessageEvent> {
    return this.acpService.runPrompt(sessionId, dto);
  }

  /**
   * Closes an ACP session and removes it from Redis.
   *
   * @param sessionId - The session UUID from the path.
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
```

---

## 12. ACP Module

### `acp.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AcpController } from './acp.controller';
import { AcpService } from './acp.service';
import { AcpSessionStore } from './acp-session.store';
import { AcpToolRegistry } from './acp-tool.registry';
import { AnthropicAdapter } from './external-agent/anthropic.adapter';

/**
 * AcpModule wires the ACP gateway endpoints.
 *
 * CacheModule is @Global() so CacheService is available without explicit import.
 * ConfigModule is re-imported for ConfigService access in adapters.
 */
@Module({
  imports: [ConfigModule],
  controllers: [AcpController],
  providers: [
    AcpService,
    AcpSessionStore,
    AcpToolRegistry,
    AnthropicAdapter,
  ],
  exports: [AcpService],
})
export class AcpModule {}
```

---

## 13. Register AcpModule in AppModule

In `kms-api/src/app.module.ts`, add `AcpModule` to the imports array alongside `AgentsModule`:

```typescript
import { AcpModule } from './modules/acp/acp.module';

// Inside @Module({ imports: [...] })
AcpModule,
```

Full placement in context:
```typescript
// Feature modules
AuthModule,
UsersModule,
HealthModule,
SourcesModule,
FilesModule,
SearchModule,
AgentsModule,
AcpModule,       // ← add here
CollectionsModule,
```

---

## 14. Package Dependency

Install the Anthropic SDK:

```bash
cd kms-api && npm install @anthropic-ai/sdk
```

The SDK is the official Node.js client. It supports async iteration over streaming responses natively. No additional peer dependencies are required.

All other dependencies are already present:
- `ioredis` — `^5.4.0` (already in package.json, used via CacheService)
- `rxjs` — `^7.8.2` (already in package.json)
- `uuid` — `^9.0.0` (already in package.json)

---

## 15. Environment Variables

### `.env` additions (local development)

```env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-5
ACP_SESSION_TTL_SECONDS=3600
```

`ANTHROPIC_MODEL` is optional — defaults to `claude-opus-4-5` in the adapter.

### `docker-compose.kms.yml` — kms-api service environment block

Add the following to the `kms-api` service's `environment` section:

```yaml
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
ANTHROPIC_MODEL: ${ANTHROPIC_MODEL:-claude-opus-4-5}
ACP_SESSION_TTL_SECONDS: ${ACP_SESSION_TTL_SECONDS:-3600}
```

The `${VAR:-default}` syntax means Docker Compose uses the env var if set, otherwise falls back to the default.

---

## 16. Config Schema Validation

Add the new env vars to the Zod schema in `kms-api/src/config/schemas/app.schema.ts`:

```typescript
ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
ANTHROPIC_MODEL: z.string().optional(),
ACP_SESSION_TTL_SECONDS: z.string().regex(/^\d+$/).optional(),
```

This ensures kms-api fails fast at startup if `ANTHROPIC_API_KEY` is missing rather than failing silently at the first API call.

---

## 17. Prompt Flow — Step by Step

This is the exact sequence for a single prompt request:

```
1. Client: POST /acp/v1/sessions/:id/prompt
           Authorization: Bearer {jwt}
           Body: { "prompt": [{ "type": "text", "text": "What embedding model does KMS use?" }] }

2. JwtAuthGuard validates JWT → sets req.user.id

3. AcpController.promptSession() calls AcpService.runPrompt(sessionId, dto)

4. AcpService creates AcpEventEmitter, starts executePromptPipeline() async (non-blocking)

5. AcpController returns emitter.subject.asObservable() to NestJS @Sse

6. NestJS opens SSE connection → HTTP 200 + Content-Type: text/event-stream

7. executePromptPipeline():
   a. AcpSessionStore.get(sessionId) → validates session, slides TTL
   b. Extracts question: "What embedding model does KMS use?"
   c. emitter.emitToolCallStart('kms_search', { query, mode: 'hybrid', limit: 5 })
      → SSE: data: {"type":"tool_call_start","data":{"tool":"kms_search",...}}
   d. AcpToolRegistry.kmsSearch(question, userId, 'hybrid', 5)
      → GET http://search-api:8001/search?q=...&mode=hybrid&limit=5
      → x-user-id: {userId} header
      → Returns: { results: [...], total: N, took_ms: 12, mode: "hybrid" }
   e. emitter.emitToolCallResult('kms_search', N)
      → SSE: data: {"type":"tool_call_result","data":{"tool":"kms_search","resultCount":N}}
   f. AnthropicAdapter.streamAnswer(question, results, emitter)
      → Builds user message with context blocks
      → client.messages.stream({ model, system, messages })
      → For each text_delta: emitter.emitChunk(text)
        → SSE: data: {"type":"agent_message_chunk","data":{"text":"BGE"}}
        → SSE: data: {"type":"agent_message_chunk","data":{"text":"-M3"}}
        → ... (one event per token)
      → emitter.emitDone()
        → SSE: data: {"type":"done","data":{}}
        → Subject.complete() → SSE connection closes

8. Client receives the full grounded answer as a stream of SSE events.
```

### Edge Case: Empty Search Results

If `kmsSearch` returns `results: []`, the flow continues normally. `AnthropicAdapter.streamAnswer` receives an empty array and sets the context text to:
```
"No relevant documents found in the knowledge base."
```
Claude then generates a response explaining it could not find relevant information. The `done` event is still emitted normally. The client is never left hanging.

### Edge Case: Session Expired

If `AcpSessionStore.get()` throws `AppError EXT0012` (session not found), the error propagates to the `.catch()` handler in `AcpService.runPrompt()`:
```typescript
.catch((err: Error) => {
  emitter.emitError(err.message);
});
```
The client receives:
```
data: {"type":"error","data":{"message":"ACP session ... not found or expired"}}
```
and the SSE stream closes.

---

## 18. Acceptance Criteria

These curl commands must all work after implementation. Run them in order.

### Step 0: Prerequisites

```bash
# Get a JWT token (use an existing test user)
JWT=$(curl -s -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  | jq -r '.data.accessToken')
echo "JWT: $JWT"
```

### Step 1: Initialize (Public — no auth)

```bash
curl -s -X POST http://localhost:8000/acp/v1/initialize \
  -H "Content-Type: application/json" \
  -d '{"protocolVersion": 1, "clientInfo": {"name": "test-client", "version": "1.0.0"}}' \
  | jq .
```

Expected response:
```json
{
  "protocolVersion": 1,
  "agentCapabilities": {
    "tools": [
      {
        "name": "kms_search",
        "description": "Search the KMS knowledge base. Returns up to `limit` ranked chunks.",
        "parameters": {
          "query": { "type": "string", "description": "The search query" },
          "mode": { "type": "string", "enum": ["keyword", "semantic", "hybrid"], "default": "hybrid" },
          "limit": { "type": "number", "default": 5 }
        }
      }
    ]
  }
}
```

### Step 2: Create Session

```bash
SESSION_ID=$(curl -s -X POST http://localhost:8000/acp/v1/sessions \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"cwd": "/Users/dev/my-project"}' \
  | jq -r '.sessionId')
echo "Session: $SESSION_ID"
```

Expected response:
```json
{ "sessionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

### Step 3: Prompt (Streaming)

```bash
curl -N -X POST http://localhost:8000/acp/v1/sessions/$SESSION_ID/prompt \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"prompt": [{"type": "text", "text": "What embedding model does this project use?"}]}'
```

Expected SSE stream:
```
data: {"type":"tool_call_start","data":{"tool":"kms_search","args":{"query":"What embedding model does this project use?","mode":"hybrid","limit":5}}}

data: {"type":"tool_call_result","data":{"tool":"kms_search","resultCount":3}}

data: {"type":"agent_message_chunk","data":{"text":"This"}}

data: {"type":"agent_message_chunk","data":{"text":" project"}}

data: {"type":"agent_message_chunk","data":{"text":" uses"}}

... (more tokens)

data: {"type":"agent_message_chunk","data":{"text":"BGE-M3 at 1024 dimensions"}}

... (more tokens citing ADR-008 or ENGINEERING_STANDARDS)

data: {"type":"done","data":{}}
```

The answer must mention **BGE-M3** (from ADR-008 or `ENGINEERING_STANDARDS.md`) and cite the source filename.

### Step 4: Close Session

```bash
curl -s -X DELETE http://localhost:8000/acp/v1/sessions/$SESSION_ID \
  -H "Authorization: Bearer $JWT" \
  -o /dev/null -w "%{http_code}"
# Expected: 204
```

### Step 5: Confirm Session is Gone

```bash
curl -s -X DELETE http://localhost:8000/acp/v1/sessions/$SESSION_ID \
  -H "Authorization: Bearer $JWT" \
  | jq .
# Expected: no error (DELETE is idempotent — CacheService.del is a no-op for missing keys)
```

---

## 19. Known Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| search-api returns empty results (KB not yet indexed) | Claude has no context | Handled — adapter sends "No relevant documents found" message to Claude; Claude still generates a response explaining the situation |
| `ANTHROPIC_API_KEY` missing at startup | kms-api crashes or adapter throws on first call | Config schema validation (Section 16) causes fast-fail at startup with a clear error |
| Anthropic SDK streaming in NestJS SSE | SSE Observable may not work with async generators | Use `client.messages.stream()` with `for await` loop inside the async pipeline method; Subject-based emitter pattern decouples the stream from the Observable |
| ACP session expires mid-conversation | User gets error mid-stream | TTL is a sliding window — `AcpSessionStore.get()` resets TTL on every prompt; default 3600s is generous |
| ACP session key collision | Two users get each other's sessions | Sessions use `uuidv4()` — collision probability is negligible; userId is stored in the session and validated on access if needed |
| Anthropic rate limits (429) | Prompt fails | `ANTHROPIC_ERROR` (EXT0013) is marked `retryable: true`; emitted as SSE error event so client can retry |
| NestJS global `JwtAuthGuard` blocks `/acp/v1/initialize` | Cannot do handshake without JWT | `@Public()` decorator bypasses the global guard — already used in auth endpoints |
| `TimeoutInterceptor` (30s global) kills long Claude streams | SSE stream cut at 30s | The `@Sse` endpoint returns an `Observable`, not a Promise — `TimeoutInterceptor` does not apply to Observables in NestJS |

---

## 20. What Phase 2 Starts With

Do not build any of these in Phase 1:

1. **Enable real embedding pipeline** — Currently disabled in `.kms/config.json`. Phase 2 turns it on so `kms_search` returns real semantic results, not just keyword matches.
2. **`kms_retrieve` tool** — Direct chunk retrieval by file ID or collection ID.
3. **`kms_graph_expand` tool** — Neo4j traversal from an entity node.
4. **Frontend chat UI** — The `/acp/v1/sessions/:id/prompt` endpoint is the backend for this; Phase 2 wires the Next.js frontend to it.
5. **Tiered retrieval (Query Classifier)** — Phase 2 adds a classifier that routes queries to BM25 (Tier 0), hybrid (Tier 1), or graph (Tier 2) before calling Claude.
6. **Multi-turn conversation** — Phase 1 is stateless per prompt. Phase 2 adds conversation history to the session store and passes it in the Anthropic messages array.

---

## 21. Implementation Checklist

Work through this list in order:

- [ ] Add `EXT0012` and `EXT0013` to `kms-api/src/errors/error-codes/index.ts`
- [ ] Add `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ACP_SESSION_TTL_SECONDS` to config Zod schema
- [ ] `npm install @anthropic-ai/sdk` in `kms-api/`
- [ ] Create `kms-api/src/modules/acp/` directory
- [ ] Create `external-agent/external-agent.types.ts`
- [ ] Create `dto/initialize-acp.dto.ts`
- [ ] Create `dto/create-session.dto.ts`
- [ ] Create `dto/prompt-session.dto.ts`
- [ ] Create `acp-session.store.ts`
- [ ] Create `acp-tool.registry.ts`
- [ ] Create `acp-event.emitter.ts`
- [ ] Create `external-agent/anthropic.adapter.ts`
- [ ] Create `acp.service.ts`
- [ ] Create `acp.controller.ts`
- [ ] Create `acp.module.ts`
- [ ] Add `AcpModule` to `app.module.ts` imports
- [ ] Add env vars to `docker-compose.kms.yml`
- [ ] Add `ANTHROPIC_API_KEY` to `.env` (local)
- [ ] Run `npm run lint` inside `kms-api/`
- [ ] Run `npm run start:dev` — confirm no startup errors
- [ ] Run acceptance criteria curl commands from Section 18
- [ ] Confirm SSE answer mentions BGE-M3 for the embedding model question
