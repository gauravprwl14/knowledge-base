import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating the text content of a generated content piece.
 *
 * Implements optimistic locking: the client must send the current `version`
 * number. If it does not match the DB value the update is rejected with 409
 * Conflict to prevent silent overwrite of concurrent edits.
 */
export class UpdateContentPieceDto {
  /**
   * The new content text for this piece.
   * Must be a non-empty string — empty content is not a valid save state.
   */
  @ApiProperty({
    description: 'New content text for the piece',
    example: 'Here is my updated LinkedIn post about TypeScript generics...',
  })
  @IsString()
  @IsNotEmpty({ message: 'content must not be empty' })
  content!: string;

  /**
   * Current version number of the piece as read from the DB.
   * Used for optimistic locking — the service rejects the update (409) if
   * this value does not match the stored version, indicating a concurrent edit.
   * The DB version is incremented automatically on every successful update.
   */
  @ApiProperty({
    description: 'Current version number (optimistic locking) — must match the DB value',
    minimum: 1,
    example: 1,
  })
  @IsInt({ message: 'version must be an integer' })
  @Min(1, { message: 'version must be at least 1' })
  version!: number;
}
