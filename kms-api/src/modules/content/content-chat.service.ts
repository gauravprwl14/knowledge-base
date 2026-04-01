import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_CLIENT } from './content.module';
import { ContentChatMessage } from '@prisma/client';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AppError } from '../../errors/types/app-error';
import { ERROR_CODES } from '../../errors/error-codes';
import { Trace } from '../../telemetry/decorators/trace.decorator';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum number of prior chat messages included in the Claude context window.
 * Older messages beyond this cap are silently dropped to avoid exceeding token limits.
 */
const CHAT_HISTORY_CAP = 20;

/**
 * Claude model used for content editing assistance.
 * Using claude-opus-4-6 for highest quality content refinement responses.
 */
const CLAUDE_MODEL = 'claude-opus-4-6';

/**
 * Maximum tokens Claude is allowed to generate per chat response.
 */
const MAX_TOKENS = 2048;

// ---------------------------------------------------------------------------
// ContentChatService
// ---------------------------------------------------------------------------

/**
 * ContentChatService — manages chat message history and streams Claude responses
 * for content piece refinement.
 *
 * Implements an SSE streaming pattern: each call to `streamChat` returns an
 * AsyncGenerator that yields plain text strings. The NestJS SSE response
 * handler wraps each yielded string as `"data: {text}\n\n"` on the wire via
 * its internal `toDataString()` call — the service must NOT pre-format strings
 * or the browser receives double-prefixed frames (`data: data: …`).
 *
 * Security model:
 *  - All user-generated content (piece text, concepts, voice brief) is wrapped
 *    in XML structural delimiters before being sent to Claude. This prevents
 *    prompt injection attacks from embedded instructions in piece content.
 *  - Job ownership is verified before any data is loaded or sent to Claude.
 *  - pieceId (when provided) is verified to belong to the jobId to prevent
 *    cross-job piece access.
 */
@Injectable()
export class ContentChatService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ContentChatService.name)
    private readonly logger: PinoLogger,
    // Injected via the ANTHROPIC_CLIENT factory provider in ContentModule.
    // Using a DI token (rather than `new Anthropic()` in the constructor body)
    // ensures tests can substitute a mock without the real HTTP client being
    // instantiated and leaving open keep-alive connections that prevent Jest
    // from exiting cleanly.
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
  ) {}

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Wraps external (user-generated) content in XML structural delimiters.
   *
   * This is a prompt-injection defence: by wrapping piece content, concepts,
   * and voice briefs in XML tags we signal to Claude that these are data
   * payloads rather than instruction text. Claude is trained to respect this
   * boundary and not interpret enclosed content as system commands.
   *
   * @param label   - The XML tag name (e.g. 'piece_content', 'concepts').
   * @param content - The raw content string to wrap.
   * @returns       The content wrapped in `<label>...</label>`.
   */
  private static wrapExternal(label: string, content: string): string {
    return `<${label}>\n${content}\n</${label}>`;
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Stream a chat response for a content job or piece.
   *
   * Context window built as:
   *   1. system: "You are a content editing assistant..."
   *   2. Prior messages (up to 20, chronological) formatted as Anthropic message objects.
   *   3. A new user message containing:
   *      - Job title + concepts_text (XML-delimited)
   *      - voice_brief_text (XML-delimited)
   *      - Current piece content if pieceId is provided (XML-delimited)
   *      - The actual user question / instruction
   *
   * Steps:
   *   1. Verify job exists and belongs to userId (throws 403 or KBCNT0001).
   *   2. If pieceId provided: verify piece belongs to job (throws KBCNT0005).
   *   3. Load last 20 messages (ORDER BY created_at DESC LIMIT 20, then reverse).
   *   4. Save the user message to DB (content_chat_messages).
   *   5. Build context + call anthropic.messages.stream(...).
   *   6. Yield plain text strings as AsyncGenerator<string>: NestJS SSE framing adds "data: …\n\n".
   *   7. After stream completes: save assistant response to DB.
   *   8. Yield final "data: [DONE]\n\n".
   *
   * Note: `@Trace()` is intentionally NOT applied here because the decorator
   * replaces the function with `async function(...)` which breaks the
   * `AsyncGenerator` protocol. OTel tracing is applied manually via the
   * `trace.getTracer()` API inside the method body instead.
   *
   * @param jobId   - UUID of the content job.
   * @param pieceId - UUID of the specific piece to refine, or null for job-level chat.
   * @param message - The user's chat message text.
   * @param userId  - UUID of the authenticated user (ownership check).
   * @returns AsyncGenerator<string> yielding plain text chunks (no SSE formatting).
   * @throws {AppError}           KBCNT0001 when job is not found.
   * @throws {ForbiddenException} when job belongs to a different user.
   * @throws {AppError}           KBCNT0005 when pieceId is provided but piece not found.
   */
  async *streamChat(
    jobId: string,
    pieceId: string | null,
    message: string,
    userId: string,
  ): AsyncGenerator<string> {
    // Manual OTel span: @Trace() cannot be used on async generator methods because
    // the decorator replaces descriptor.value with `async function(...)`, which
    // breaks the AsyncGenerator protocol. We create the span manually instead.
    const tracer = trace.getTracer('kms-api');
    const span = tracer.startSpan('ContentChatService.streamChat');
    span.setAttribute('code.function', 'streamChat');
    span.setAttribute('code.namespace', 'ContentChatService');
    span.setAttribute('content.job_id', jobId);
    if (pieceId) span.setAttribute('content.piece_id', pieceId);

    this.logger.info(
      { jobId, pieceId, userId, messageLength: message.length },
      'content-chat: streamChat started',
    );

    // ------------------------------------------------------------------
    // Step 1: Verify job exists and belongs to the requesting user
    // ------------------------------------------------------------------
    const job = await this.prisma.contentJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError({
        code: ERROR_CODES.CNT.JOB_NOT_FOUND.code,
        message: ERROR_CODES.CNT.JOB_NOT_FOUND.message,
        statusCode: ERROR_CODES.CNT.JOB_NOT_FOUND.httpStatus,
      });
    }

    if (job.userId !== userId) {
      // Return 403 rather than 404 — the job exists but the requester cannot
      // know that, so we use a generic forbidden message.
      throw new ForbiddenException('Access to this content job is forbidden');
    }

    // ------------------------------------------------------------------
    // Step 2: If pieceId provided, verify it belongs to this job
    // ------------------------------------------------------------------
    let pieceContent: string | null = null;

    if (pieceId) {
      const piece = await this.prisma.contentPiece.findUnique({
        where: { id: pieceId },
      });

      if (!piece || piece.jobId !== jobId) {
        throw new AppError({
          code: ERROR_CODES.CNT.PIECE_NOT_FOUND.code,
          message: ERROR_CODES.CNT.PIECE_NOT_FOUND.message,
          statusCode: ERROR_CODES.CNT.PIECE_NOT_FOUND.httpStatus,
        });
      }

      pieceContent = piece.content;
    }

    // ------------------------------------------------------------------
    // Step 3: Load last 20 messages (DESC then reverse → chronological)
    // ------------------------------------------------------------------
    const recentMessagesDesc = await this.prisma.contentChatMessage.findMany({
      where: {
        jobId,
        // If pieceId is set, scope to piece-level messages only.
        // null pieceId means job-level chat (WHERE piece_id IS NULL).
        pieceId: pieceId ?? null,
      },
      orderBy: { createdAt: 'desc' },
      take: CHAT_HISTORY_CAP,
    });

    // Reverse to restore chronological (oldest first) ordering for Claude.
    const recentMessages = recentMessagesDesc.reverse();

    // ------------------------------------------------------------------
    // Step 4: Save the user message to DB before calling Claude
    // ------------------------------------------------------------------
    await this.prisma.contentChatMessage.create({
      data: {
        jobId,
        pieceId: pieceId ?? null,
        userId,
        role: 'user',
        content: message,
      },
    });

    // ------------------------------------------------------------------
    // Step 5: Build the Claude context and start streaming
    // ------------------------------------------------------------------

    // Build the enriched user message that includes job context.
    // External content is always XML-wrapped for prompt-injection safety.
    const contextParts: string[] = [];

    // Always include job metadata as context
    if (job.title) {
      contextParts.push(`Job title: ${job.title}`);
    }

    if (job.conceptsText) {
      contextParts.push(ContentChatService.wrapExternal('concepts', job.conceptsText));
    }

    if (job.voiceBriefText) {
      contextParts.push(
        ContentChatService.wrapExternal('voice_brief', job.voiceBriefText),
      );
    }

    if (pieceContent !== null) {
      // Wrap piece content in XML delimiters to prevent prompt injection.
      // A malicious user could otherwise embed "Ignore all instructions" in
      // their piece content. The XML wrapper signals to Claude this is data.
      contextParts.push(
        ContentChatService.wrapExternal('piece_content', pieceContent),
      );
    }

    // Append the actual user question / instruction
    contextParts.push(`User request: ${message}`);

    const enrichedUserMessage = contextParts.join('\n\n');

    // Map prior messages to Anthropic message format
    const priorMessages: Anthropic.MessageParam[] = recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Append the new enriched user message
    const allMessages: Anthropic.MessageParam[] = [
      ...priorMessages,
      { role: 'user', content: enrichedUserMessage },
    ];

    let fullAssistantResponse = '';

    try {
      // Use the streaming API so we can yield chunks as they arrive.
      const stream = this.anthropic.messages.stream({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system:
          'You are a content editing assistant. You help users refine and improve ' +
          'their generated content pieces. Be concise, constructive, and respect the ' +
          "user's voice and style. When editing content, preserve the author's intent " +
          'while improving clarity, engagement, and platform suitability.',
        messages: allMessages,
      });

      // ------------------------------------------------------------------
      // Step 6: Yield SSE events for each text chunk
      // ------------------------------------------------------------------
      for await (const event of stream) {
        // The SDK emits typed events — we only care about content_block_delta
        // events that carry incremental text chunks.
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          const text = event.delta.text;
          if (text) {
            fullAssistantResponse += text;
            // Yield the raw text chunk only. NestJS's SSE response handler
            // calls toDataString() on message.data, which prepends "data: " and
            // appends "\n\n" automatically. Pre-formatting here would produce
            // double-prefixed frames: "data: data: Hello\n\n".
            yield text;
          }
        }
      }
    } catch (err: unknown) {
      // Log the Anthropic API failure with full context, then yield an error
      // SSE event so the client can show a meaningful error message.
      this.logger.error(
        { jobId, pieceId, userId, error: String(err) },
        'content-chat: Anthropic API stream failed',
      );
      // Record the error on the OTel span before ending it
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : 'Anthropic stream failed',
      });
      if (err instanceof Error) span.recordException(err);
      span.end();
      // Yield a plain error sentinel — NestJS SSE framing will wrap this as
      // "data: [ERROR] Generation failed\n\n" on the wire.
      yield '[ERROR] Generation failed';
      return;
    }

    // ------------------------------------------------------------------
    // Step 7: Persist the assistant's full response to DB
    // ------------------------------------------------------------------
    if (fullAssistantResponse) {
      await this.prisma.contentChatMessage.create({
        data: {
          jobId,
          pieceId: pieceId ?? null,
          userId,
          role: 'assistant',
          content: fullAssistantResponse,
        },
      });
    }

    this.logger.info(
      { jobId, pieceId, userId, responseLength: fullAssistantResponse.length },
      'content-chat: streamChat completed',
    );

    // Mark span as successful and end it before yielding DONE
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    // ------------------------------------------------------------------
    // Step 8: Signal stream completion to the client
    // ------------------------------------------------------------------
    // Yield the plain sentinel string; NestJS SSE framing produces
    // "data: [DONE]\n\n" on the wire without manual formatting here.
    yield '[DONE]';
  }

  /**
   * Get chat history for a job or a specific piece.
   *
   * Messages are returned in chronological order (oldest first) for display.
   * Job ownership is verified before any messages are returned.
   *
   * @param jobId   - UUID of the content job.
   * @param pieceId - UUID of the piece to scope the history to, or null for job-level.
   * @param userId  - UUID of the authenticated user (ownership check).
   * @returns Array of ContentChatMessage records in chronological order.
   * @throws {AppError}           KBCNT0001 when job not found.
   * @throws {ForbiddenException} when job belongs to a different user.
   */
  @Trace({ name: 'content-chat.getChatHistory' })
  async getChatHistory(
    jobId: string,
    pieceId: string | null,
    userId: string,
  ): Promise<ContentChatMessage[]> {
    this.logger.info({ jobId, pieceId, userId }, 'content-chat: getChatHistory');

    // Verify job exists and belongs to the requesting user
    const job = await this.prisma.contentJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new AppError({
        code: ERROR_CODES.CNT.JOB_NOT_FOUND.code,
        message: ERROR_CODES.CNT.JOB_NOT_FOUND.message,
        statusCode: ERROR_CODES.CNT.JOB_NOT_FOUND.httpStatus,
      });
    }

    if (job.userId !== userId) {
      throw new ForbiddenException('Access to this content job is forbidden');
    }

    // Return messages in chronological order (ASC) for UI rendering
    const messages = await this.prisma.contentChatMessage.findMany({
      where: {
        jobId,
        pieceId: pieceId ?? null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return messages;
  }
}
