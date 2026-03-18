import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { TagsService, TagResponse } from './tags.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTagDto } from './dto/create-tag.dto';
import { BulkTagDto } from './dto/bulk-tag.dto';
import { KmsTag } from '@prisma/client';

/**
 * TagsController — REST endpoints for the KMS tag system.
 *
 * Exposes two groups of routes:
 *   - /tags        — CRUD on user-owned tags
 *   - /files/:fileId/tags/:tagId — associate / dissociate a tag from a file
 *   - /files/bulk-tag             — apply a tag to many files at once
 *
 * All routes require a valid JWT access token.
 * Multi-tenant isolation is enforced via `req.user.id` passed to TagsService.
 */
@ApiTags('Tags')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller()
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // ---------------------------------------------------------------------------
  // TAG CRUD — /tags
  // ---------------------------------------------------------------------------

  /**
   * Returns all tags owned by the authenticated user, each including the
   * number of files the tag is currently applied to.
   *
   * @param req - Fastify request carrying `req.user.id`.
   * @returns Array of tags sorted alphabetically.
   */
  @Get('tags')
  @ApiOperation({ summary: 'List all tags for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listTags(@Request() req: any): Promise<TagResponse[]> {
    return this.tagsService.listTags(req.user.id);
  }

  /**
   * Creates a new tag for the authenticated user.
   *
   * Enforces the 50-tag per-user limit (TAG0003) and rejects duplicate names
   * within the same user's tag set (TAG0002).
   *
   * @param dto - Tag creation payload (name, optional color).
   * @param req - Fastify request carrying `req.user.id`.
   * @returns The created KmsTag.
   */
  @Post('tags')
  @ApiOperation({ summary: 'Create a new tag' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 400, description: 'Tag limit exceeded or validation error' })
  @ApiResponse({ status: 409, description: 'Tag name already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createTag(@Body() dto: CreateTagDto, @Request() req: any): Promise<KmsTag> {
    return this.tagsService.createTag(req.user.id, dto.name, dto.color);
  }

  /**
   * Deletes a tag by its UUID.
   * Silently succeeds if the tag does not exist or belongs to another user.
   * All kms_file_tags rows referencing this tag are removed via CASCADE.
   *
   * @param id - Tag UUID (validated as UUID v4).
   * @param req - Fastify request carrying `req.user.id`.
   */
  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag' })
  @ApiParam({ name: 'id', type: String, description: 'Tag UUID' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteTag(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
  ): Promise<void> {
    await this.tagsService.deleteTag(id, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // FILE-TAG ASSOCIATIONS — /files/:fileId/tags/:tagId
  // ---------------------------------------------------------------------------

  /**
   * Applies a tag to a file.
   *
   * Verifies tag ownership (TAG0001 if not found). Idempotent — applying an
   * already-applied tag is a no-op.
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   * @param req - Fastify request carrying `req.user.id`.
   */
  @Post('files/:fileId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Apply a tag to a file' })
  @ApiParam({ name: 'fileId', type: String, description: 'File UUID' })
  @ApiParam({ name: 'tagId', type: String, description: 'Tag UUID' })
  @ApiResponse({ status: 204, description: 'Tag applied' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addTagToFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.tagsService.addTagToFile(fileId, tagId, req.user.id);
  }

  /**
   * Removes a tag from a file.
   *
   * Verifies tag ownership (TAG0001 if not found). Idempotent.
   *
   * @param fileId - File UUID.
   * @param tagId - Tag UUID.
   * @param req - Fastify request carrying `req.user.id`.
   */
  @Delete('files/:fileId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tag from a file' })
  @ApiParam({ name: 'fileId', type: String, description: 'File UUID' })
  @ApiParam({ name: 'tagId', type: String, description: 'Tag UUID' })
  @ApiResponse({ status: 204, description: 'Tag removed' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeTagFromFile(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.tagsService.removeTagFromFile(fileId, tagId, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // BULK TAG — /files/bulk-tag
  // ---------------------------------------------------------------------------

  /**
   * Applies a single tag to multiple files in one request.
   *
   * Accepts up to 100 file UUIDs. Files not owned by the user are silently
   * ignored. Returns the count of new associations created.
   *
   * @param dto - Payload with `fileIds` array and `tagId`.
   * @param req - Fastify request carrying `req.user.id`.
   * @returns `{ tagged: N }` where N is the number of new associations.
   */
  @Post('files/bulk-tag')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a tag to multiple files at once (max 100)' })
  @ApiResponse({ status: 200, description: 'Tag applied to files' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async bulkTagFiles(
    @Body() dto: BulkTagDto,
    @Request() req: any,
  ): Promise<{ tagged: number }> {
    return this.tagsService.bulkTagFiles(dto.fileIds, dto.tagId, req.user.id);
  }
}
