import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { WorkflowProcessorService } from './workflow.processor';
import { ContentStoreService } from './content-store.service';

/**
 * WorkflowModule orchestrates the full URL-ingestion pipeline.
 *
 * Architecture (ADR-0028 — no BullMQ):
 *
 * 1. HTTP POST /workflow/urls/ingest  → WorkflowController → WorkflowService
 * 2. WorkflowService creates a `kms_workflow_jobs` DB record (status=QUEUED)
 *    and schedules processing via `setImmediate` (non-blocking).
 * 3. WorkflowProcessorService runs in the same NestJS process and executes:
 *    a. POST url-agent:8004 /api/v1/urls/ingest  — content extraction
 *    b. Anthropic Claude                          — 2-3 sentence summary
 *    c. ContentStoreService.write()               — YAML-frontmatted .md file
 *    d. UPDATE kms_workflow_jobs.status → COMPLETED (or FAILED)
 *
 * ScheduleModule is imported for future periodic cleanup of old FAILED/COMPLETED
 * job records (e.g., jobs older than 30 days).
 *
 * HttpModule is imported for url-agent HTTP calls via the native fetch API;
 * it also makes HttpService available if a future refactor prefers it.
 */
@Module({
  imports: [
    // ConfigModule provides URL_AGENT_URL, ANTHROPIC_API_KEY, CONTENT_STORE_PATH
    ConfigModule,

    // ScheduleModule enables @Cron / @Interval decorators for future
    // periodic cleanup of stale workflow job records
    ScheduleModule.forRoot(),
  ],
  controllers: [WorkflowController],
  providers: [
    WorkflowService,           // job creation, status look-up, async scheduling
    WorkflowProcessorService,  // pipeline execution: extract → summarise → store
    ContentStoreService,       // YAML-frontmatted markdown persistence to disk
  ],
  // Export WorkflowService so other modules can queue workflow jobs programmatically
  exports: [WorkflowService],
})
export class WorkflowModule {}
