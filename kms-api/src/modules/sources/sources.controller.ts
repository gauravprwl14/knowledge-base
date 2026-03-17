import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SourcesService } from './sources.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * SourcesController exposes REST endpoints for managing knowledge sources.
 *
 * All routes require a valid JWT access token (`Authorization: Bearer <token>`).
 * A "source" is an external data origin (local folder, Google Drive, S3, etc.)
 * that the KMS ingests content from via the `kms.scan` queue.
 */
@ApiTags('Sources')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  /**
   * Returns all knowledge sources visible to the authenticated user.
   *
   * @returns Array of source records.
   */
  @Get()
  @ApiOperation({ summary: 'List all knowledge sources' })
  @ApiResponse({ status: 200, description: 'Sources retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.sourcesService.findAll();
  }

  /**
   * Returns a single knowledge source by its UUID.
   *
   * @param id - UUID of the source.
   * @returns The matching source record.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a knowledge source by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiResponse({ status: 200, description: 'Source retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Source not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string) {
    return this.sourcesService.findOne(id);
  }

  /**
   * Creates a new knowledge source and enqueues an initial scan job.
   *
   * @param body - Source creation payload.
   * @returns The newly created source record.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new knowledge source' })
  @ApiResponse({ status: 201, description: 'Source created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Source already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() body: Record<string, unknown>) {
    return this.sourcesService.create(body);
  }

  /**
   * Partially updates an existing knowledge source.
   *
   * @param id - UUID of the source to update.
   * @param body - Fields to update.
   * @returns The updated source record.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a knowledge source' })
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiResponse({ status: 200, description: 'Source updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Source not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.sourcesService.update(id, body);
  }

  /**
   * Deletes a knowledge source and all its associated files.
   *
   * @param id - UUID of the source to delete.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledge source' })
  @ApiParam({ name: 'id', type: String, description: 'Source UUID' })
  @ApiResponse({ status: 204, description: 'Source deleted successfully' })
  @ApiResponse({ status: 404, description: 'Source not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@Param('id') id: string) {
    return this.sourcesService.remove(id);
  }
}
