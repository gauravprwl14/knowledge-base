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
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { AddFilesToCollectionDto } from './dto/add-files-to-collection.dto';
import { CollectionResponseDto } from './dto/collection-response.dto';

/**
 * CollectionsController exposes REST endpoints for managing KMS collections.
 *
 * A collection is a named, user-owned group of files that can be used to scope
 * search queries or RAG context to a curated subset of the knowledge base.
 *
 * All routes are versioned under `api/v1/collections` and require a valid JWT
 * access token via {@link JwtAuthGuard}.
 */
@ApiTags('Collections')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('api/v1/collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * Returns all collections owned by the authenticated user.
   *
   * @param userId - Injected from JWT via {@link CurrentUser}.
   * @returns Array of collection response DTOs with computed file counts.
   */
  @Get()
  @ApiOperation({ summary: 'List all collections for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Collections retrieved successfully', type: [CollectionResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list(@CurrentUser('id') userId: string): Promise<CollectionResponseDto[]> {
    return this.collectionsService.list(userId);
  }

  /**
   * Creates a new named collection for the authenticated user.
   *
   * @param userId - Injected from JWT via {@link CurrentUser}.
   * @param dto - Collection creation payload.
   * @returns The created collection response DTO.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new collection' })
  @ApiResponse({ status: 201, description: 'Collection created successfully', type: CollectionResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.create(userId, dto);
  }

  /**
   * Returns a single collection by its UUID.
   *
   * @param id - UUID of the collection.
   * @param userId - Injected from JWT via {@link CurrentUser}.
   * @returns The matching collection response DTO.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a collection by ID' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 200, description: 'Collection retrieved successfully', type: CollectionResponseDto })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async get(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.get(id, userId);
  }

  /**
   * Partially updates a collection's name, description, colour, or icon.
   *
   * @param id - UUID of the collection.
   * @param userId - Injected from JWT via {@link CurrentUser}.
   * @param dto - Partial update payload.
   * @returns The updated collection response DTO.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 200, description: 'Collection updated successfully', type: CollectionResponseDto })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.update(id, userId, dto);
  }

  /**
   * Deletes a collection and all its file membership records.
   *
   * The default collection cannot be deleted (returns 409 Conflict).
   *
   * @param id - UUID of the collection to delete.
   * @param userId - Injected from JWT via {@link CurrentUser}.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 204, description: 'Collection deleted successfully' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete the default collection' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.collectionsService.delete(id, userId);
  }

  /**
   * Adds multiple files to a collection in a single request.
   *
   * All file UUIDs must belong to the authenticated user. Files already in
   * the collection are silently skipped.
   *
   * @param id - UUID of the collection.
   * @param userId - Injected from JWT via {@link CurrentUser}.
   * @param dto - Payload containing the array of file UUIDs to add.
   */
  @Post(':id/files')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Add files to a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiResponse({ status: 204, description: 'Files added successfully' })
  @ApiResponse({ status: 404, description: 'Collection or file not found' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async addFiles(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddFilesToCollectionDto,
  ): Promise<void> {
    return this.collectionsService.addFiles(id, userId, dto);
  }

  /**
   * Removes a single file from a collection.
   *
   * @param id - UUID of the collection.
   * @param fileId - UUID of the file to remove.
   * @param userId - Injected from JWT via {@link CurrentUser}.
   */
  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a file from a collection' })
  @ApiParam({ name: 'id', type: String, description: 'Collection UUID' })
  @ApiParam({ name: 'fileId', type: String, description: 'File UUID to remove' })
  @ApiResponse({ status: 204, description: 'File removed from collection' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.collectionsService.removeFile(id, userId, fileId);
  }
}
