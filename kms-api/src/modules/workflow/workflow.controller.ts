import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkflowService } from './workflow.service';
import { IngestUrlDto, WorkflowJobDto } from './dto/ingest-url.dto';

/**
 * WorkflowController exposes the HTTP surface for the URL ingestion pipeline.
 *
 * All endpoints require a valid JWT (via JwtAuthGuard).  Swagger docs are
 * auto-generated through @ApiTags / @ApiOperation / @ApiResponse decorators.
 *
 * Routes:
 * - POST /workflow/urls/ingest  — submit a URL for async ingestion
 * - GET  /workflow/jobs/:jobId  — poll the status of a queued job
 */
@ApiTags('workflow')
@UseGuards(JwtAuthGuard)
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  /**
   * Queue a URL for ingestion into the KMS knowledge base.
   *
   * Processing is asynchronous.  The response returns immediately with a
   * `jobId` that can be used to poll GET /workflow/jobs/:jobId for status.
   *
   * @param dto    - Validated request body (url + optional collectionId).
   * @param req    - Fastify request; `req.user.id` is populated by JwtAuthGuard.
   * @returns WorkflowJobDto with status `queued` and the assigned job ID.
   */
  @Post('urls/ingest')
  @ApiOperation({ summary: 'Ingest a URL into the knowledge base' })
  @ApiResponse({ status: 201, type: WorkflowJobDto, description: 'Job accepted and queued' })
  @ApiResponse({ status: 400, description: 'Validation error (invalid URL format)' })
  @ApiResponse({ status: 401, description: 'JWT missing or invalid' })
  async ingestUrl(
    @Body() dto: IngestUrlDto,
    @Request() req: any,
  ): Promise<WorkflowJobDto> {
    // Delegate to WorkflowService which handles UUID generation and BullMQ enqueue
    return this.workflowService.queueUrlIngest(dto, req.user.id);
  }

  /**
   * Retrieve the current status of a workflow job.
   *
   * BullMQ job states: waiting → active → completed | failed.
   * Returns `not_found` when the job ID is unknown.
   *
   * @param jobId - UUID v4 job identifier returned by POST /workflow/urls/ingest.
   * @returns Object with jobId and current BullMQ state string.
   */
  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get workflow job status' })
  @ApiResponse({ status: 200, description: 'Job status retrieved' })
  @ApiResponse({ status: 401, description: 'JWT missing or invalid' })
  async getJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<{ jobId: string; status: string }> {
    // Proxy through WorkflowService so the controller stays thin
    return this.workflowService.getJobStatus(jobId);
  }
}
