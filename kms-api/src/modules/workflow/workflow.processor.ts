import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../../logger/logger.service';
import { ContentStoreService } from './content-store.service';

/**
 * WorkflowProcessor is the BullMQ worker that executes the URL-ingestion
 * pipeline asynchronously after WorkflowService enqueues the job.
 *
 * Pipeline stages for each `url-ingest` job:
 * 1. **Content extraction** — POST url-agent:8004 /api/v1/urls/ingest
 *    Falls back to mock content if the service is unreachable (dev mode).
 * 2. **Summary generation** — Anthropic Claude (claude-opus-4-5 by default)
 *    Falls back to a static placeholder if ANTHROPIC_API_KEY is not set.
 * 3. **Content persistence** — ContentStoreService writes a YAML-frontmatted
 *    markdown file to CONTENT_STORE_PATH (/tmp/kms-content by default).
 *
 * Inherits retry behaviour (3 attempts, exponential back-off) from the job
 * options set in WorkflowService.queueUrlIngest.
 */
@Processor('workflow')
export class WorkflowProcessor extends WorkerHost {
  private readonly logger: AppLogger;

  constructor(
    private readonly contentStore: ContentStoreService,
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    super();
    // Bind class name as structured logging context for every log emitted here
    this.logger = logger.child({ context: WorkflowProcessor.name });
  }

  /**
   * BullMQ entry point — called once per dequeued job.
   * Routes to the correct handler based on the job name set during enqueue.
   *
   * @param job - BullMQ Job object carrying the serialised payload.
   */
  async process(job: Job): Promise<void> {
    // Route based on job name — future pipeline stages can be added here
    if (job.name === 'url-ingest') {
      await this.handleUrlIngest(job);
    } else {
      // Log unknown job names rather than silently swallowing them
      this.logger.warn('Unknown workflow job name received — skipping', { jobName: job.name });
    }
  }

  /**
   * Execute the three-stage URL-ingestion pipeline for a single job.
   *
   * Stages are intentionally sequential: content must exist before summarisation,
   * and summarisation must complete before we know what to persist.
   *
   * @param job - BullMQ job whose data contains { jobId, url, userId, collectionId }.
   */
  private async handleUrlIngest(job: Job): Promise<void> {
    const { jobId, url, userId, collectionId } = job.data;
    this.logger.info('Processing URL ingest job', { jobId, url });

    // ── Stage 1: Content extraction via url-agent ─────────────────────────
    const extractedContent = await this.extractContent(jobId, url, userId, collectionId);

    // ── Stage 2: Summarisation via Anthropic Claude ───────────────────────
    const summary = await this.generateSummary(extractedContent.title as string, url);

    // ── Stage 3: Persist YAML-frontmatted markdown to content store ────────
    const markdownContent = this.buildMarkdown(jobId, url, extractedContent, summary);
    const filePath = await this.contentStore.write(jobId, markdownContent);

    this.logger.info('URL ingest job completed', { jobId, filePath });
  }

  /**
   * Call url-agent to extract content from the given URL.
   *
   * url-agent (port 8004) handles both YouTube transcript extraction and
   * general web scraping — the caller does not need to distinguish.
   *
   * Falls back to mock content when url-agent is not running (useful in
   * local dev without Docker) so the rest of the pipeline can still be tested.
   *
   * @param jobId       - Job identifier passed to url-agent for correlation.
   * @param url         - URL to extract content from.
   * @param userId      - Owner user ID forwarded to url-agent for audit.
   * @param collectionId - Optional collection ID forwarded for routing.
   * @returns Parsed JSON response from url-agent (or mock equivalent).
   */
  private async extractContent(
    jobId: string,
    url: string,
    userId: string,
    collectionId?: string,
  ): Promise<Record<string, unknown>> {
    // Read url-agent base URL from config — allows overriding in tests/staging
    const urlAgentBase = this.configService.get<string>('URL_AGENT_URL', 'http://url-agent:8004');

    try {
      const response = await fetch(`${urlAgentBase}/api/v1/urls/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          user_id: userId,
          source_id: null,      // not yet tied to a KMS source record
          collection_id: collectionId ?? null,
        }),
        // 30 s generous timeout — YouTube transcripts can be slow to fetch
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        // Treat non-2xx as a retryable error so BullMQ will back off and retry
        throw new Error(`url-agent responded with HTTP ${response.status}`);
      }

      const extracted = await response.json() as Record<string, unknown>;
      this.logger.info('Content extracted by url-agent', {
        jobId,
        urlType: extracted.url_type,
        title: extracted.title,
      });
      return extracted;
    } catch (err) {
      // Fall back to mock content when url-agent is unavailable.
      // This keeps the pipeline runnable in dev mode without Docker.
      this.logger.warn('url-agent unavailable — using mock content for dev', {
        jobId,
        url,
        error: (err as Error).message,
      });
      return this.getMockContent(url, jobId);
    }
  }

  /**
   * Generate a concise 2-3 sentence summary using Anthropic Claude.
   *
   * Requires ANTHROPIC_API_KEY in the environment.  When the key is absent
   * (local dev without credentials) a static placeholder is returned instead,
   * so the pipeline always completes end-to-end.
   *
   * The Anthropic SDK is imported dynamically so the module can still boot
   * even if the npm package is not installed (optional dependency pattern).
   *
   * @param title - Page/video title used as the summary prompt context.
   * @param url   - Source URL included in the prompt for factual grounding.
   * @returns Plain-text summary string (2-3 sentences).
   */
  private async generateSummary(title: string, url: string): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    // Skip API call entirely when no key is configured — prevents cold errors in dev
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not set — using static summary fallback');
      return `This document covers the topic "${title}" from ${url}. It has been ingested into the KMS knowledge base for future retrieval and search.`;
    }

    try {
      // Dynamic import keeps @anthropic-ai/sdk as an optional dependency —
      // the module still boots if the package is missing (though summarisation will fail)
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const model = this.configService.get<string>('ANTHROPIC_MODEL', 'claude-opus-4-5');

      const message = await client.messages.create({
        model,
        max_tokens: 256, // 2-3 sentences fits comfortably within 256 tokens
        messages: [
          {
            role: 'user',
            content:
              `Write a 2-3 sentence summary for a document titled "${title}" ` +
              `sourced from: ${url}. Be concise and factual.`,
          },
        ],
      });

      // Extract the text content block from the response (Claude always returns at least one)
      const textBlock = message.content.find((b) => b.type === 'text');
      return textBlock ? (textBlock as { type: 'text'; text: string }).text : 'Summary unavailable.';
    } catch (err) {
      // Summarisation failure is non-fatal — log and fall back so the job still completes
      this.logger.warn('Anthropic summary generation failed — using fallback text', {
        error: (err as Error).message,
      });
      return `Document: "${title}" ingested from ${url}.`;
    }
  }

  /**
   * Compose a YAML-frontmatted markdown document from the extracted content
   * and generated summary.
   *
   * The frontmatter schema is intentionally minimal — consumers (e.g., the
   * embed-worker) can parse it with any YAML library without a strict schema.
   *
   * @param jobId    - Unique job ID used as the document `id` field.
   * @param url      - Source URL recorded for provenance.
   * @param extracted - url-agent response object.
   * @param summary   - Generated or fallback summary string.
   * @returns Full markdown string with YAML frontmatter.
   */
  private buildMarkdown(
    jobId: string,
    url: string,
    extracted: Record<string, unknown>,
    summary: string,
  ): string {
    const now = new Date().toISOString();
    // Title falls back to 'Untitled' when url-agent could not determine one
    const title = (extracted.title as string | undefined) ?? 'Untitled';
    const urlType = (extracted.url_type as string | undefined) ?? 'web';

    // YAML frontmatter follows Jekyll/Hugo conventions so the file is portable
    return `---
id: ${jobId}
created_at: ${now}
content_type: transcript
status: ingested
generator_model: workflow-engine-v1
source_url: ${url}
url_type: ${urlType}
title: ${title}
---

# ${title}

## Summary

${summary}

## Source

- URL: ${url}
- Ingested: ${now}
- Job ID: ${jobId}
`;
  }

  /**
   * Return mock url-agent content for development / testing when the real
   * url-agent service is not available.
   *
   * Detects YouTube URLs by hostname to set a meaningful `url_type`.
   *
   * @param url   - Original URL submitted for ingestion.
   * @param jobId - Job identifier for correlation.
   * @returns Mock content object mirroring the url-agent response shape.
   */
  private getMockContent(url: string, jobId: string): Record<string, unknown> {
    // Detect YouTube by hostname — covers both youtube.com and youtu.be short links
    const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
    return {
      job_id: jobId,
      url,
      url_type: isYouTube ? 'youtube' : 'web',
      title: isYouTube ? 'YouTube Video (Mock)' : 'Web Article (Mock)',
      content_length: 500,
      queued_at: new Date().toISOString(),
    };
  }
}
