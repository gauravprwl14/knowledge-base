import { Module } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseModule } from '../../database/database.module';
import { QueueModule } from '../../queue/queue.module';
import { ContentJobsService } from './content-jobs.service';
import { ContentPiecesService } from './content-pieces.service';
import { ContentChatService } from './content-chat.service';
import { ContentConfigService } from './content-config.service';
import { ContentJobPublisher } from './content-job.publisher';
import { ContentJobOwnerGuard } from './guards/content-job-owner.guard';
import { ContentController } from './content.controller';

/**
 * Injection token for the Anthropic SDK client.
 *
 * Using a string token (rather than the class itself) allows tests to provide a
 * mock via `{ provide: ANTHROPIC_CLIENT, useValue: mockClient }` without the
 * real Anthropic constructor running and opening keep-alive HTTP connections
 * that prevent Jest from exiting cleanly.
 */
export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/**
 * ContentModule — encapsulates the content creator pipeline integration for KMS.
 *
 * This module owns the content generation job lifecycle:
 *   - `ContentController`    — HTTP REST + SSE layer for all content endpoints
 *   - `ContentJobsService`   — job create / list / get / delete / stale detection
 *   - `ContentPiecesService` — piece update / active variation / variation generation
 *   - `ContentChatService`   — SSE streaming chat for content piece refinement
 *   - `ContentConfigService` — per-user config and creator voice profile management
 *   - `ContentJobPublisher`  — publishes messages to the `kms.content` RabbitMQ queue
 *   - `ContentJobOwnerGuard` — IDOR guard for job-scoped routes
 *
 * DatabaseModule provides PrismaService.
 * QueueModule is @Global() so its providers are available without re-importing,
 * but we import it explicitly here for clarity and to ensure the module graph
 * is self-documenting.
 *
 * ANTHROPIC_CLIENT is a factory provider so the real Anthropic HTTP client is
 * only instantiated in production. Tests can substitute a mock via DI without
 * any real HTTP connections being opened.
 */
@Module({
  imports: [DatabaseModule, QueueModule],
  controllers: [ContentController],
  providers: [
    // Anthropic SDK factory — reads ANTHROPIC_API_KEY at module init time.
    // Tests override this with { provide: ANTHROPIC_CLIENT, useValue: mock }.
    {
      provide: ANTHROPIC_CLIENT,
      useFactory: () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    },
    ContentJobsService,
    ContentPiecesService,
    ContentChatService,
    ContentConfigService,
    ContentJobPublisher,
    ContentJobOwnerGuard,
  ],
  exports: [
    ContentJobsService,
    ContentPiecesService,
    ContentChatService,
    ContentConfigService,
    ContentJobOwnerGuard,
  ],
})
export class ContentModule {}
