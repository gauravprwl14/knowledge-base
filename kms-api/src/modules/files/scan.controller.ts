import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';

/**
 * Body DTO for the scan trigger endpoint.
 */
class TriggerScanDto {
  /** FULL re-indexes everything; INCREMENTAL only processes changes since last scan. Defaults to FULL. */
  scanType?: 'FULL' | 'INCREMENTAL';
}

/**
 * ScanController exposes scan-related endpoints under the /sources prefix.
 *
 * Routes:
 * - POST /sources/:sourceId/scan          — trigger a scan job
 * - GET  /sources/:sourceId/scan-history  — list past scan jobs for a source
 *
 * These routes belong semantically to the Sources domain but are implemented
 * in FilesModule because they produce and query KmsScanJob records which are
 * managed by FilesService.
 *
 * All routes require a valid JWT access token.
 */
@ApiTags('Sources')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('sources')
export class ScanController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Triggers a scan job for a connected source.
   *
   * If a QUEUED or RUNNING scan already exists for the source, the existing
   * job is returned without creating a duplicate.
   *
   * @param sourceId - Source UUID
   * @param userId   - Injected from JWT
   * @param body     - Optional scanType override (defaults to FULL)
   * @returns The new or existing KmsScanJob record
   */
  @Post(':sourceId/scan')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'sourceId', type: String, description: 'Source UUID' })
  @ApiBody({
    type: TriggerScanDto,
    required: false,
    schema: {
      type: 'object',
      properties: {
        scanType: {
          type: 'string',
          enum: ['FULL', 'INCREMENTAL'],
          default: 'FULL',
          description: 'FULL re-indexes everything; INCREMENTAL processes only changes since last scan',
        },
      },
    },
  })
  @ApiEndpoint({
    summary: 'Trigger a scan job for a source',
    description:
      'Creates a KmsScanJob record and publishes it to the kms.scan BullMQ queue. ' +
      'Returns an existing active job if one is already running.',
    successStatus: HttpStatus.CREATED,
    responses: [{ status: HttpStatus.NOT_FOUND, description: 'Source not found' }],
  })
  async triggerScan(
    @Param('sourceId') sourceId: string,
    @CurrentUser('id') userId: string,
    @Body() body: TriggerScanDto = {},
  ) {
    return this.filesService.triggerScan(sourceId, userId, body.scanType ?? 'FULL');
  }

  /**
   * Returns all past scan jobs for a source, newest first.
   *
   * @param sourceId - Source UUID
   * @param userId   - Injected from JWT
   * @returns Array of KmsScanJob records
   */
  @Get(':sourceId/scan-history')
  @ApiParam({ name: 'sourceId', type: String, description: 'Source UUID' })
  @ApiEndpoint({
    summary: 'List scan history for a source',
    description: 'Returns all past scan jobs for the given source, newest first.',
    isArray: true,
    responses: [{ status: HttpStatus.NOT_FOUND, description: 'Source not found' }],
  })
  async getScanHistory(
    @Param('sourceId') sourceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.getScanHistory(sourceId, userId);
  }
}
