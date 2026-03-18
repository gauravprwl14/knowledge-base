import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

/**
 * BulkDeleteDto — payload for POST /files/bulk-delete.
 *
 * Accepts between 1 and 100 file UUIDs per request.
 * The service will only delete files owned by the authenticated user.
 */
export class BulkDeleteDto {
  /** Array of file UUIDs to delete. Max 100 per request. */
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    description: 'Array of file UUIDs to delete (max 100)',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}

/**
 * Response for a bulk-delete operation.
 */
export class BulkDeleteResponseDto {
  /** Number of files actually deleted */
  @ApiProperty({ example: 3 })
  deleted!: number;
}
