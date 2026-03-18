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
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids: string[];
}
