import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for bulk-deleting files.
 *
 * @example
 * ```json
 * { "ids": ["uuid1", "uuid2", "uuid3"] }
 * ```
 */
export class BulkDeleteDto {
  /**
   * Array of file UUIDs to delete.
   * Minimum 1, maximum 100 per request.
   */
  @ApiProperty({
    description: 'Array of file UUIDs to delete (min: 1, max: 100)',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];
}

/**
 * Response for a bulk-delete operation.
 */
export class BulkDeleteResponseDto {
  /** Number of files actually deleted */
  @ApiProperty({ example: 3 })
  deleted!: number;
}
