import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID, ArrayMaxSize, ArrayMinSize } from 'class-validator';

/**
 * BulkTagDto — payload for POST /files/bulk-tag.
 *
 * Applies a single tag to multiple files in one request.
 * Accepts between 1 and 100 file UUIDs.
 */
export class BulkTagDto {
  /** Array of file UUIDs to tag. Max 100 per request. */
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    description: 'File UUIDs to apply the tag to (max 100)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  fileIds: string[];

  /** UUID of the tag to apply. */
  @ApiProperty({ description: 'Tag UUID to apply to all specified files' })
  @IsUUID()
  tagId: string;
}
