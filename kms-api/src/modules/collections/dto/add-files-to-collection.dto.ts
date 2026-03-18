import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for adding multiple files to a collection in a single request.
 */
export class AddFilesToCollectionDto {
  /**
   * Array of file UUIDs to add to the collection.
   * All UUIDs must belong to the authenticated user and must be valid v4 UUIDs.
   *
   * @example ["550e8400-e29b-41d4-a716-446655440000"]
   */
  @ApiProperty({
    description: 'Array of file UUIDs to add to the collection',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  fileIds: string[];
}
