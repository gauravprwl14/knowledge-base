import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/**
 * Schema for initiating OAuth — minimal, mostly server-controlled.
 * The userId is derived from the JWT; no body fields required.
 */
export const createSourceSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
});

export type CreateSourceDto = z.infer<typeof createSourceSchema>;

/**
 * Query params for GET /sources (cursor-based pagination).
 */
export const listSourcesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListSourcesQueryDto = z.infer<typeof listSourcesQuerySchema>;

/**
 * Schema for registering a local filesystem folder as a source.
 */
export const registerLocalSourceSchema = z.object({
  path: z.string().min(1, 'Path is required'),
  displayName: z.string().min(1).max(255).optional(),
});

export type RegisterLocalSourceDto = z.infer<typeof registerLocalSourceSchema>;

/**
 * Schema for registering an Obsidian vault as a source.
 * OBSIDIAN is a subtype of LOCAL — same filesystem access.
 */
export const registerObsidianVaultSchema = z.object({
  vaultPath: z.string().min(1, 'Vault path is required'),
  displayName: z.string().min(1).max(255).optional(),
});

export type RegisterObsidianVaultDto = z.infer<typeof registerObsidianVaultSchema>;

// ---------------------------------------------------------------------------
// Swagger request DTOs
// ---------------------------------------------------------------------------

/**
 * Request body DTO for source creation (Swagger documentation only).
 */
export class CreateSourceRequestDto {
  @ApiPropertyOptional({
    example: 'My Google Drive',
    description: 'Human-readable label for the source',
  })
  displayName?: string;
}

/**
 * Request body DTO for local filesystem source registration (Swagger documentation only).
 */
export class RegisterLocalSourceRequestDto {
  @ApiProperty({
    example: '/data/documents',
    description: 'Absolute path to the local folder. Must be accessible to the scan-worker container.',
  })
  path: string;

  @ApiPropertyOptional({
    example: 'My Documents',
    description: 'Human-readable label for the source',
  })
  displayName?: string;
}

/**
 * Request body DTO for Obsidian vault registration (Swagger documentation only).
 */
export class RegisterObsidianVaultRequestDto {
  @ApiProperty({
    example: '/vault',
    description: 'Absolute path to the Obsidian vault. Use /vault if using the Docker test-vault mount.',
  })
  vaultPath: string;

  @ApiPropertyOptional({
    example: 'My Knowledge Base',
    description: 'Human-readable label for the vault',
  })
  displayName?: string;
}

// ---------------------------------------------------------------------------
// Swagger response DTOs
// ---------------------------------------------------------------------------

/**
 * Response DTO for a connected source.
 *
 * NOTE: `encryptedTokens` is intentionally excluded from this DTO and must
 * never be added here. Tokens are stored encrypted in the DB and are an
 * internal concern of the SourcesService only.
 */
export class SourceResponseDto {
  @ApiProperty({ description: 'Source UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ description: 'Owner user UUID' })
  userId: string;

  @ApiProperty({
    description: 'Source type',
    enum: ['LOCAL', 'GOOGLE_DRIVE', 'OBSIDIAN'],
    example: 'GOOGLE_DRIVE',
  })
  type: string;

  @ApiProperty({
    description: 'Connection status',
    enum: ['PENDING', 'IDLE', 'CONNECTED', 'SCANNING', 'COMPLETED', 'EXPIRED', 'ERROR', 'DISCONNECTED', 'PAUSED'],
    example: 'CONNECTED',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Human-readable name for this source',
    example: 'Work Google Drive',
  })
  displayName?: string | null;

  @ApiPropertyOptional({
    description: 'External provider identifier (e.g. Google Drive root folder ID)',
    example: 'root',
  })
  externalId?: string | null;

  @ApiPropertyOptional({
    description: 'Timestamp of the last successful sync',
  })
  lastSyncedAt?: Date | null;

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt: Date;
}

/**
 * Response DTO for the OAuth initiation endpoint.
 */
export class OAuthInitiateResponseDto {
  @ApiProperty({
    description: 'Google OAuth consent URL — redirect the browser here',
    example: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=...',
  })
  authUrl: string;
}
