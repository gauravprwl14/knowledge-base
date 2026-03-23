import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Source config update schema
// ---------------------------------------------------------------------------

/**
 * Schema for updating a source's sync configuration.
 * Supports folder filtering, file type filtering, and transcription rules.
 * All fields are optional — only provided fields are merged into the stored config.
 */
export const updateSourceConfigSchema = z.object({
  syncFolderIds: z.array(z.string()).optional(),
  includeExtensions: z.array(z.string()).optional(),
  excludeExtensions: z.array(z.string()).optional(),
  transcribeVideos: z.boolean().optional(),
  transcriptionMinDurationSecs: z.number().min(0).max(3600).optional(),
  transcriptionExcludePatterns: z.array(z.string()).optional(),
});

export type UpdateSourceConfigDto = z.infer<typeof updateSourceConfigSchema>;

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

// ---------------------------------------------------------------------------
// Swagger request/response DTOs for config and folder endpoints
// ---------------------------------------------------------------------------

/**
 * Request body DTO for PATCH /sources/:id/config (Swagger documentation only).
 * Fields map to `updateSourceConfigSchema` — all are optional for partial updates.
 */
export class UpdateSourceConfigRequestDto {
  @ApiPropertyOptional({
    description: 'Google Drive folder IDs to include in the sync. Empty array means all folders.',
    example: ['1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'],
    type: [String],
  })
  syncFolderIds?: string[];

  @ApiPropertyOptional({
    description: 'File extensions to include (e.g. [".pdf", ".docx"]). Empty means all.',
    example: ['.pdf', '.docx'],
    type: [String],
  })
  includeExtensions?: string[];

  @ApiPropertyOptional({
    description: 'File extensions to exclude (e.g. [".tmp", ".log"]).',
    example: ['.tmp', '.log'],
    type: [String],
  })
  excludeExtensions?: string[];

  @ApiPropertyOptional({
    description: 'Whether to transcribe video files found in the source.',
    example: false,
  })
  transcribeVideos?: boolean;

  @ApiPropertyOptional({
    description: 'Minimum video duration in seconds before transcription is triggered.',
    example: 60,
  })
  transcriptionMinDurationSecs?: number;

  @ApiPropertyOptional({
    description: 'Filename patterns to exclude from transcription (glob-style).',
    example: ['*_preview*', '*_draft*'],
    type: [String],
  })
  transcriptionExcludePatterns?: string[];
}

/**
 * Response DTO for a single Google Drive folder entry.
 * Returned by GET /sources/google-drive/folders.
 */
export class DriveFolderDto {
  @ApiProperty({ description: 'Google Drive folder ID', example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs' })
  id: string;

  @ApiProperty({ description: 'Human-readable folder name', example: 'Work Documents' })
  name: string;

  @ApiProperty({
    description: 'Slash-separated path from the queried parent. For root children this equals the folder name.',
    example: 'Work Documents',
  })
  path: string;

  @ApiProperty({
    description: 'Approximate number of immediate children folders (0 if uncounted).',
    example: 0,
  })
  childCount: number;
}
