import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

/**
 * BulkMoveDto — payload for POST /files/bulk-move.
 *
 * Moves up to 100 files into the specified collection.
 * Only files owned by the authenticated user are affected.
 */
export class BulkMoveDto {
  /** Array of file UUIDs to move into the collection. Max 100 per request. */
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    description: 'Array of file UUIDs to move (max 100)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  fileIds: string[];

  /** UUID of the target collection. */
  @ApiProperty({ description: 'Target collection UUID' })
  @IsUUID()
  collectionId: string;
}
