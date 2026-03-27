import {
  Controller,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';
import { ScanJobRepository } from '../../database/repositories/scan-job.repository';
import { ScanJobStatus } from '@prisma/client';

/**
 * Internal endpoint for the scan-worker to report job status updates.
 *
 * This endpoint is @Public — it is called from within the Docker network by
 * the scan-worker Python service. In production, restrict access to the
 * internal network or use a service token.
 *
 * Route:
 * - PATCH /scan-jobs/:id/status — update scan job status (called by scan-worker)
 */
@SkipThrottle()
@ApiTags('Internal')
@Controller('scan-jobs')
export class ScanJobsController {
  constructor(private readonly scanJobRepository: ScanJobRepository) {}

  /**
   * Updates a scan job's status and optional metadata.
   * Called by the Python scan-worker after each status transition.
   *
   * @param id - Scan job UUID
   * @param body - New status, optional metadata and error message
   */
  @Public()
  @Patch(':id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: String, description: 'Scan job UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['RUNNING', 'COMPLETED', 'FAILED'] },
        errorMessage: { type: 'string', description: 'Error detail on failure' },
        metadata: { type: 'object', description: 'Extra metadata (filesDiscovered, etc.)' },
      },
    },
  })
  @ApiEndpoint({
    summary: 'Update scan job status (worker callback)',
    description: 'Internal endpoint called by the scan-worker to report job status transitions.',
    successStatus: HttpStatus.NO_CONTENT,
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; errorMessage?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    if (body.status === 'RUNNING') {
      updateData.status = ScanJobStatus.RUNNING;
      updateData.startedAt = new Date();
    } else if (body.status === 'COMPLETED') {
      updateData.status = ScanJobStatus.COMPLETED;
      updateData.finishedAt = new Date();
      updateData.completedAt = new Date();
      if (body.metadata?.files_discovered !== undefined) {
        updateData.filesDiscovered = body.metadata.files_discovered as number;
      }
    } else if (body.status === 'FAILED') {
      updateData.status = ScanJobStatus.FAILED;
      updateData.finishedAt = new Date();
      if (body.errorMessage) updateData.errorMessage = body.errorMessage;
    }

    if (Object.keys(updateData).length > 0) {
      await this.scanJobRepository.update({ id }, updateData);
    }
  }
}
