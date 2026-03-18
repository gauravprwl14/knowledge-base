import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListFilesQueryDto } from './dto/list-files-query.dto';
import { ListFilesResponseDto } from './dto/list-files-response.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { BulkMoveDto } from './dto/bulk-move.dto';

/**
 * FilesController — REST endpoints for querying and managing KMS files.
 *
 * Files are individual documents discovered by the scan-worker and processed
 * by the embed-worker. Clients can list, inspect, delete, and move files.
 *
 * All routes require a valid JWT access token (via JwtAuthGuard).
 * Multi-tenant isolation is enforced at the service/repository layer using
 * `req.user.id`.
 */
@ApiTags('Files')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  // ---------------------------------------------------------------------------
  // BULK ACTIONS — must be declared BEFORE :id routes to avoid param capture
  // ---------------------------------------------------------------------------

  /**
   * Bulk-deletes up to 100 files owned by the authenticated user.
   * Files belonging to other users are silently ignored.
   *
   * @param dto - Body containing the array of file UUIDs.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Count of actually deleted files.
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete files by IDs (max 100)' })
  @ApiResponse({ status: 200, description: 'Files deleted' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bulkDeleteFiles(
    @Body() dto: BulkDeleteDto,
    @Request() req: any,
  ): Promise<{ deleted: number }> {
    return this.filesService.bulkDeleteFiles(dto.ids, req.user.id);
  }

  /**
   * Bulk-moves up to 100 files into a target collection.
   * Files not owned by the authenticated user are silently ignored.
   *
   * @param dto - Body containing fileIds array and target collectionId.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Count of new collection memberships created.
   */
  @Post('bulk-move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move files into a collection (max 100)' })
  @ApiResponse({ status: 200, description: 'Files moved' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bulkMoveFiles(
    @Body() dto: BulkMoveDto,
    @Request() req: any,
  ): Promise<{ moved: number }> {
    return this.filesService.bulkMoveFiles(dto.fileIds, dto.collectionId, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // LIST
  // ---------------------------------------------------------------------------

  /**
   * Returns a cursor-paginated list of KMS files with optional filters.
   *
   * Supported filters: sourceId, mimeGroup, status, collectionId, tags[], search.
   * Pass the returned `nextCursor` as `?cursor=` on the next request to page through.
   *
   * @param query - Validated query params (ListFilesQueryDto).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Paginated file list.
   */
  @Get()
  @ApiOperation({ summary: 'List KMS files with optional filters and cursor pagination' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully', type: ListFilesResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listFiles(
    @Query() query: ListFilesQueryDto,
    @Request() req: any,
  ): Promise<ListFilesResponseDto> {
    return this.filesService.listFiles({
      userId: req.user.id,
      cursor: query.cursor,
      limit: query.limit ?? 20,
      sourceId: query.sourceId,
      mimeGroup: query.mimeGroup,
      status: query.status,
      collectionId: query.collectionId,
      tags: query.tags,
      search: query.search,
    }) as unknown as ListFilesResponseDto;
  }

  // ---------------------------------------------------------------------------
  // GET ONE
  // ---------------------------------------------------------------------------

  /**
   * Returns a single KMS file by its UUID.
   * Returns 404 if the file does not exist or belongs to another user.
   *
   * @param id - File UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The matching file record.
   */
  @Get(':id')
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'File retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<object> {
    return this.filesService.findOne(id, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // DELETE SINGLE
  // ---------------------------------------------------------------------------

  /**
   * Hard-deletes a single KMS file.
   * Returns 404 if the file does not exist or belongs to another user.
   * Related chunks, collection memberships, and file-tag rows are removed
   * automatically via database cascade rules.
   *
   * @param id - File UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns `{ deleted: true }` on success.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a KMS file by ID' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'File deleted' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ deleted: boolean }> {
    return this.filesService.deleteFile(id, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // TAG UPDATE (legacy — backward compat)
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Replaces the tags array on a file using the legacy string-tag model.
   * Prefer the TagsModule endpoints for the new relational tag system.
   *
   * @param id - File UUID.
   * @param body - Object containing the `tags` string array.
   * @returns The updated file record.
   */
  @Patch(':id/tags')
  @ApiOperation({ summary: 'Update tags on a KMS file (legacy)' })
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
  async updateTags(
    @Param('id') id: string,
    @Body() body: { tags: string[] },
  ): Promise<unknown> {
    return this.filesService.updateTags(id, body.tags);
  }
}
