import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';

/**
 * FilesController exposes REST endpoints for querying KMS files.
 *
 * Routes:
 * - GET /files         — paginated file list (cursor-based)
 * - GET /files/:id     — single file by UUID
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
   * Returns a cursor-based page of KMS files belonging to the caller.
   *
   * @param userId - Injected from JWT
   * @param cursor - Opaque cursor from the previous response
   * @param limit  - Max results per page (default: 20)
   */
  @Get()
  @ApiEndpoint({
    summary: 'List KMS files (cursor pagination)',
    description: 'Returns a page of files belonging to the authenticated user. Use nextCursor for subsequent pages.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Opaque cursor from previous page' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max results per page (default: 20)' })
  async listFiles(
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    return this.filesService.listFiles(userId, cursor, parsedLimit);
  }

  /**
   * Returns a single KMS file by its UUID.
   *
   * @param id     - File UUID
   * @param userId - Injected from JWT
   */
  @Get(':id')
  @ApiParam({ name: 'id', type: String, description: 'File UUID' })
  @ApiEndpoint({
    summary: 'Get a KMS file by ID',
    description: 'Returns a single file owned by the caller. 404 if not found or not owned.',
    responses: [{ status: HttpStatus.NOT_FOUND, description: 'File not found' }],
  })
  async getFile(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.filesService.getFile(id, userId);
  }
}
