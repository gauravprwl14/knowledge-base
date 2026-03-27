import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response shape returned from all collection endpoints.
 *
 * Includes a computed `fileCount` derived from the `kms_collection_files` join table.
 */
export class CollectionResponseDto {
  /** Unique UUID of the collection. */
  @ApiProperty({ description: 'Collection UUID' })
  id: string;

  /** Human-readable name. */
  @ApiProperty({ description: 'Collection name' })
  name: string;

  /** Optional free-text description. */
  @ApiPropertyOptional({ description: 'Collection description' })
  description?: string;

  /** Optional hex colour code for UI display. */
  @ApiPropertyOptional({ description: 'Hex colour code' })
  color?: string;

  /** Optional icon identifier for UI display. */
  @ApiPropertyOptional({ description: 'Icon identifier' })
  icon?: string;

  /**
   * Whether this is the user's default collection.
   * Default collections cannot be deleted.
   */
  @ApiProperty({ description: 'True if this is the default collection' })
  isDefault: boolean;

  /** Number of files currently in this collection. */
  @ApiProperty({ description: 'Number of files in the collection' })
  fileCount: number;

  /** ISO-8601 creation timestamp. */
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  /** ISO-8601 last-updated timestamp. */
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
