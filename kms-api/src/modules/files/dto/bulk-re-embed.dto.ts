import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

/**
 * BulkReEmbedDto — payload for POST /files/bulk-re-embed.
 *
 * Accepts between 1 and 100 file UUIDs per request.
 * The service resets matching files owned by the authenticated user to PENDING
 * status and publishes embed job messages to the `kms.embed` queue.
 * Files owned by other users are silently ignored.
 */
export class BulkReEmbedDto {
  /**
   * Array of file UUIDs to re-embed. Max 100 per request.
   */
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    description: 'Array of file UUIDs to re-embed (max 100)',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}

/**
 * Response for a bulk-re-embed operation.
 */
export class BulkReEmbedResponseDto {
  /**
   * Number of files actually queued for re-embedding.
   * Equals the count of owned files found; foreign IDs are excluded silently.
   */
  @ApiProperty({ example: 3 })
  queued!: number;
}
