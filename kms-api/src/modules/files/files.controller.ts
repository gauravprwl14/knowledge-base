import {
  Controller,
  Get,
  Delete,
  Patch,
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
  ApiBody,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * FilesController exposes REST endpoints for querying and managing KMS files.
 *
 * Files are individual documents discovered by the scan-worker and processed
 * by the embed-worker. Clients can list, inspect, delete, and tag files via
 * these endpoints.
 *
 * All routes require a valid JWT access token.
 */
@ApiTags('Files')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Returns all KMS files with optional filtering.
   *
   * @returns Array of file records.
   */
  @Get()
  @ApiOperation({ summary: 'List all KMS files' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.filesService.findAll();
  }

  /**
   * Returns a single KMS file by its UUID.
   *
   * @param id - UUID of the file.
   * @returns The matching file record.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a KMS file by ID' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'File retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string) {
    return this.filesService.findOne(id);
  }

  /**
   * Soft-deletes a KMS file and removes its embedding from Qdrant.
   *
   * @param id - UUID of the file to delete.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a KMS file' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 204, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@Param('id') id: string) {
    return this.filesService.remove(id);
  }

  /**
   * Replaces the tags on a KMS file.
   *
   * @param id - UUID of the file to tag.
   * @param body - Object containing the `tags` array.
   * @returns The updated file record.
   */
  @Patch(':id/tags')
  @ApiOperation({ summary: 'Update tags on a KMS file' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['tags'],
    },
  })
  @ApiResponse({ status: 200, description: 'Tags updated successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.filesService.updateTags(id, body.tags);
  }
}
