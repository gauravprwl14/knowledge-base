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
  ApiBody,
} from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * CollectionsController exposes REST endpoints for managing KMS collections.
 *
 * A collection is a named, user-owned group of files that can be used to scope
 * search queries or RAG context to a curated subset of the knowledge base.
 *
 * All routes require a valid JWT access token.
 */
@ApiTags('Collections')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * Returns all collections owned by the authenticated user.
   *
   * @returns Array of collection records.
   */
  @Get()
  @ApiOperation({ summary: 'List all collections for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll() {
    return this.collectionsService.findAll();
  }

  /**
   * Creates a new named collection.
   *
   * @param body - Object with `name` and optional `description`.
   * @returns The created collection record.
   */
  @Post()
  @ApiOperation({ summary: 'Create a new collection' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Collection name' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: ['name'],
    },
  })
  @ApiResponse({ status: 201, description: 'Collection created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() body: { name: string; description?: string }) {
    return this.collectionsService.create(body);
  }

  /**
   * Returns a single collection by its UUID.
   *
   * @param id - UUID of the collection.
   * @returns The matching collection record.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a collection by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 200, description: 'Collection retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string) {
    return this.collectionsService.findOne(id);
  }

  /**
   * Updates a collection's name or description.
   *
   * @param id - UUID of the collection.
   * @param body - Partial update payload.
   * @returns The updated collection record.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Collection updated successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Body() body: { name?: string; description?: string }) {
    return this.collectionsService.update(id, body);
  }

  /**
   * Deletes a collection and all its file membership records.
   *
   * @param id - UUID of the collection to delete.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 204, description: 'Collection deleted successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  remove(@Param('id') id: string) {
    return this.collectionsService.remove(id);
  }

  /**
   * Adds a file to an existing collection.
   *
   * @param id - UUID of the collection.
   * @param body - Object containing the `file_id` to add.
   * @returns The created membership record.
   */
  @Post(':id/files')
  @ApiOperation({ summary: 'Add a file to a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string', description: 'UUID of the file to add' },
      },
      required: ['file_id'],
    },
  })
  @ApiResponse({ status: 201, description: 'File added to collection successfully' })
  @ApiResponse({ status: 404, description: 'Collection or file not found' })
  @ApiResponse({ status: 409, description: 'File already in collection' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  addFile(@Param('id') id: string, @Body() body: { file_id: string }) {
    return this.collectionsService.addFile(id, body.file_id);
  }
}
