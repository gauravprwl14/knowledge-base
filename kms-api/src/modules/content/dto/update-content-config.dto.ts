import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shape of a single platform entry inside `platformConfig`.
 * Validated structurally in ContentConfigService before persistence.
 */
export interface PlatformConfigEntry {
  /** Whether this platform is enabled for auto-generation. */
  enabled: boolean;
  /** List of format identifiers for this platform (e.g. ['post', 'carousel']). */
  formats?: string[];
  /** Number of variations to generate per format (1–5). */
  variations?: number;
  /** Whether to auto-generate without user confirmation. */
  autoGenerate?: boolean;
}

/**
 * DTO for updating a user's content creator configuration.
 *
 * All fields are optional — a PATCH-style operation.
 * The hashnodeApiKey field is the raw plaintext key; the service
 * encrypts it using AES-256-GCM before storing it in the database.
 */
export class UpdateContentConfigDto {
  /**
   * Per-platform configuration map.
   * Keys are platform identifiers (e.g. 'linkedin', 'blog', 'instagram').
   * Each value must be a valid {@link PlatformConfigEntry}.
   */
  @ApiPropertyOptional({
    description: 'Per-platform content generation settings',
    example: {
      linkedin: { enabled: true, formats: ['post'], variations: 2, autoGenerate: false },
      blog: { enabled: false },
    },
  })
  @IsOptional()
  @IsObject()
  platformConfig?: Record<string, PlatformConfigEntry>;

  /**
   * Voice mode for content generation.
   * - `auto`: apply voice profile to all generated content automatically
   * - `interactive`: prompt user before applying voice
   * - `disabled`: do not apply voice profile
   */
  @ApiPropertyOptional({
    description: "Voice mode: 'auto' | 'interactive' | 'disabled'",
    enum: ['auto', 'interactive', 'disabled'],
    example: 'auto',
  })
  @IsOptional()
  @IsIn(['auto', 'interactive', 'disabled'])
  voiceMode?: string;

  /**
   * Raw Hashnode API key for publishing blog posts.
   * The service will encrypt this value before storing it — never stored in plaintext.
   */
  @ApiPropertyOptional({
    description: 'Hashnode API key for direct publishing (encrypted before storage)',
    example: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  hashnodeApiKey?: string;
}
