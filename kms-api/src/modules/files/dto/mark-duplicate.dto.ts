import { IsString, IsUUID, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for marking a file as a duplicate of another.
 *
 * @example
 * ```json
 * {
 *   "duplicateOf": "uuid-of-canonical-file",
 *   "checksum": "sha256-hex-string"
 * }
 * ```
 */
export class MarkDuplicateDto {
  /** UUID of the canonical (original) file that this file duplicates. */
  @ApiProperty({
    description: 'UUID of the canonical file this file duplicates',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4')
  duplicateOf!: string;

  /**
   * SHA-256 checksum that establishes the duplicate relationship.
   * Must be a 64-character hex string.
   */
  @ApiProperty({
    description: 'SHA-256 checksum of the file content (64-char hex)',
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  checksum!: string;
}
