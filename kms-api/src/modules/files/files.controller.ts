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
import { FilesService, DuplicateGroup } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListFilesQueryDto, EMBEDDING_STATUS_TO_FILE_STATUS } from './dto/list-files-query.dto';
import { ListFilesResponseDto } from './dto/list-files-response.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { BulkMoveDto } from './dto/bulk-move.dto';
import { BulkReEmbedDto, BulkReEmbedResponseDto } from './dto/bulk-re-embed.dto';
import { IngestNoteDto } from './dto/ingest-note.dto';

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
  // INGEST — must be declared BEFORE :id routes to avoid param capture
  // ---------------------------------------------------------------------------

  /**
   * Ingests an Obsidian note directly into the KMS indexing pipeline.
   *
   * Creates or reuses an OBSIDIAN source for the authenticated user, writes a
   * `kms_files` row with PENDING status, and publishes an embed job message
   * directly to `kms.embed` — bypassing the scan-worker stage.
   *
   * The note content travels inline inside the AMQP message so the embed-worker
   * never attempts a disk read.
   *
   * @param dto - Validated ingest request body.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The UUID of the newly created file and its Obsidian source.
   */
  @Post('ingest')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingest an Obsidian note directly into the KMS pipeline' })
  @ApiResponse({ status: 201, description: 'Note queued for indexing' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async ingestNote(
    @Body() dto: IngestNoteDto,
    @Request() req: any,
  ): Promise<{ fileId: string; sourceId: string }> {
    return this.filesService.ingestNote(dto, req.user.id);
  }

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

  /**
   * Bulk re-queues up to 100 files owned by the authenticated user for
   * re-embedding. Files belonging to other users are silently ignored.
   *
   * Resets each matched file's status to PENDING and publishes an embed job
   * message to the `kms.embed` queue so the embed-worker will reprocess them.
   *
   * @param dto - Body containing the array of file UUIDs (max 100).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Count of files actually queued for re-embedding.
   */
  @Post('bulk-re-embed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk re-queue files for re-embedding (max 100)' })
  @ApiResponse({ status: 200, description: 'Files queued for re-embedding', type: BulkReEmbedResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Exceeds 100-file limit' })
  async bulkReEmbedFiles(
    @Body() dto: BulkReEmbedDto,
    @Request() req: any,
  ): Promise<BulkReEmbedResponseDto> {
    return this.filesService.bulkReEmbed(dto.ids, req.user.id);
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
      // FR-13: embeddingStatus takes precedence over status when both are present
      status: query.embeddingStatus
        ? EMBEDDING_STATUS_TO_FILE_STATUS[query.embeddingStatus]
        : query.status,
      collectionId: query.collectionId,
      tags: query.tags,
      search: query.search,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      embeddingStatus: query.embeddingStatus,
    }) as unknown as ListFilesResponseDto;
  }

  // ---------------------------------------------------------------------------
  // DUPLICATES — must be declared BEFORE :id routes to avoid param capture
  // ---------------------------------------------------------------------------

  /**
   * Returns all duplicate file groups for the authenticated user.
   *
   * Files are grouped by their SHA-256 checksum. Only groups where two or more
   * non-deleted files share the same checksum are returned. Within each group
   * files are ordered oldest → newest; the oldest is treated as the canonical
   * "keep" file.
   *
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Object with `groups` array of DuplicateGroup objects.
   */
  @Get('duplicates')
  @ApiOperation({ summary: 'List duplicate file groups (grouped by SHA-256 checksum)' })
  @ApiResponse({ status: 200, description: 'Duplicate groups retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getDuplicateGroups(
    @Request() req: any,
  ): Promise<{ groups: DuplicateGroup[] }> {
    const groups = await this.filesService.getDuplicateGroups(req.user.id);
    return { groups };
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPTION STATUS
  // ---------------------------------------------------------------------------

  /**
   * Returns the latest voice transcription job status for a file.
   *
   * Returns `null` when no transcription job has been created for the file
   * (e.g. the file is not audio/video, or the feature flag was disabled when
   * the file was first discovered).
   *
   * @param id - File UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The latest KmsVoiceJob summary, or `null`.
   */
  @Get(':id/transcription')
  @ApiOperation({ summary: 'Get transcription status for a file' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'Transcription job status (null if none)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTranscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<object | null> {
    return this.filesService.getTranscription(req.user.id, id);
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPT PRE-SIGNED URL
  // ---------------------------------------------------------------------------

  /**
   * Returns a short-lived pre-signed download URL (15-minute TTL) for the
   * transcript of the given file.
   *
   * Returns `null` when the file has no completed transcription job, or when
   * the job was completed before `transcript_path` was introduced.
   *
   * @param id - File UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns An object with `url`, or `null`.
   */
  @Get(':id/transcription/url')
  @ApiOperation({ summary: 'Get pre-signed download URL for the transcript (15-min TTL)' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'Pre-signed URL (null if no transcript)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTranscriptUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ url: string } | null> {
    return this.filesService.getTranscriptUrl(req.user.id, id);
  }

  // ---------------------------------------------------------------------------
  // TRANSCRIPT RAW TEXT
  // ---------------------------------------------------------------------------

  /**
   * Fetches and returns the full transcript text from MinIO for the given file.
   *
   * Returns `null` when the file has no completed transcription job, or when
   * the job was completed before `transcript_path` was introduced.
   *
   * @param id - File UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns An object with `text`, or `null`.
   */
  @Get(':id/transcription/text')
  @ApiOperation({ summary: 'Fetch full transcript text from MinIO' })
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiResponse({ status: 200, description: 'Transcript text (null if no transcript)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTranscriptText(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<{ text: string } | null> {
    return this.filesService.getTranscriptText(req.user.id, id);
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
