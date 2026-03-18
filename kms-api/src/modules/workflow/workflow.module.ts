import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowProcessor } from './workflow.processor';
import { ContentStoreService } from './content-store.service';

/**
 * WorkflowModule orchestrates the full URL-ingestion pipeline:
 *
 * 1. HTTP POST /workflow/urls/ingest  → WorkflowController → WorkflowService
 * 2. WorkflowService enqueues a BullMQ job on the `workflow` queue.
 * 3. WorkflowProcessor (BullMQ worker) picks up the job and runs:
 *    a. POST url-agent:8004 /api/v1/urls/ingest  — content extraction
 *    b. Anthropic Claude                          — 2-3 sentence summary
 *    c. ContentStoreService.write()               — YAML-frontmatted .md file
 *
 * BullMQ Redis connection is inherited from the global QueueModule
 * (BullModule.forRootAsync is already registered there).
 */
@Module({
  imports: [
    // Register the `workflow` BullMQ queue.
    // The Redis connection is inherited from BullModule.forRootAsync in QueueModule
    // (which is @Global), so we only need to declare the queue name here.
    BullModule.registerQueue({ name: 'workflow' }),

    // ConfigModule provides URL_AGENT_URL, ANTHROPIC_API_KEY, CONTENT_STORE_PATH
    ConfigModule,
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,    // queue management + job status
    WorkflowProcessor,  // BullMQ worker — async pipeline execution
    ContentStoreService, // YAML-frontmatted markdown persistence
  ],
  // Export WorkflowService so other modules can queue workflow jobs programmatically
  exports: [WorkflowService],
})
export class WorkflowModule {}
