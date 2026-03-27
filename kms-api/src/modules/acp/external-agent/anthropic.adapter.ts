import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AppLogger } from '../../../logger/logger.service';
import { AppError } from '../../../errors/types/app-error';
import { ERROR_CODES } from '../../../errors/error-codes';
import { AcpEventEmitter } from '../acp-event.emitter';
import { KmsSearchResult } from './external-agent.types';

const DEFAULT_MODEL = 'claude-opus-4-5';
const MAX_TOKENS = 2048;

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
  private readonly client: Anthropic | undefined;
  private readonly model: string;

  constructor(
    private readonly config: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.child({ context: AnthropicAdapter.name });
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not configured — AnthropicAdapter disabled');
      this.model = DEFAULT_MODEL;
      return;
    }
    this.client = new Anthropic({ apiKey });
    this.model = this.config.get<string>('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;
  }

  /**
   * Streams a grounded answer from Claude for the given question.
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
    if (!this.client) {
      throw new AppError({
        code: ERROR_CODES.SRV.CONFIGURATION_ERROR.code,
        message: 'ANTHROPIC_API_KEY is not configured',
      });
    }
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
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
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
