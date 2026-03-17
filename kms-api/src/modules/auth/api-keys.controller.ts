import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  CreateApiKeyDto,
  CreateApiKeyRequestDto,
  createApiKeySchema,
  CreateApiKeyResponseDto,
  ApiKeyResponseDto,
} from './dto/auth.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';

/**
 * API Keys Controller
 *
 * Manages API keys for programmatic access:
 * - POST /api/v1/auth/api-keys   — generate a new API key
 * - GET  /api/v1/auth/api-keys   — list the caller's API keys (metadata only)
 * - DELETE /api/v1/auth/api-keys/:id — revoke an API key
 */
@ApiTags('API Keys')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('auth/api-keys')
export class ApiKeysController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Generates a new API key for the authenticated user.
   * The plaintext key is returned ONCE; store it immediately.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiEndpoint({
    summary: 'Create API key',
    description: 'Generates a new API key. The plaintext key is returned once — store it securely.',
    responseType: CreateApiKeyResponseDto,
    successStatus: HttpStatus.CREATED,
    responses: [
      { status: HttpStatus.TOO_MANY_REQUESTS, description: 'API key limit reached (max 10 active keys)' },
    ],
  })
  async createApiKey(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponseDto> {
    return this.authService.createApiKey(userId, dto);
  }

  /**
   * Lists all API keys belonging to the authenticated user.
   * Key values are never returned — only metadata.
   */
  @Get()
  @ApiEndpoint({
    summary: 'List API keys',
    description: "Returns metadata for all of the caller's API keys. Key values are never returned.",
    responseType: ApiKeyResponseDto,
    isArray: true,
  })
  async listApiKeys(
    @CurrentUser('id') userId: string,
  ): Promise<ApiKeyResponseDto[]> {
    return this.authService.listApiKeys(userId);
  }

  /**
   * Revokes an API key by ID.
   * The caller must own the key.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiEndpoint({
    summary: 'Revoke API key',
    description: 'Revokes the specified API key. The caller must own the key.',
    successStatus: HttpStatus.NO_CONTENT,
    responses: [
      { status: HttpStatus.NOT_FOUND, description: 'API key not found or not owned by caller' },
    ],
  })
  async revokeApiKey(
    @CurrentUser('id') userId: string,
    @Param('id') keyId: string,
  ): Promise<void> {
    return this.authService.revokeApiKey(userId, keyId);
  }
}
