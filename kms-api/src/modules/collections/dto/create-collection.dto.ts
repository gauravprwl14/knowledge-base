import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new KMS collection.
 *
 * A collection is a named, user-owned grouping of files used to scope
 * search queries or RAG context to a curated subset of the knowledge base.
 */
export class CreateCollectionDto {
  /**
   * Human-readable name for the collection.
   *
   * @example "Research Papers"
   */
  @ApiProperty({ description: 'Collection name', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  /**
   * Optional free-text description of the collection's purpose.
   *
   * @example "Academic papers related to ML research"
   */
  @ApiPropertyOptional({ description: 'Optional collection description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Optional hex colour code for UI display (e.g. "#3B82F6").
   *
   * @example "#3B82F6"
   */
  @ApiPropertyOptional({ description: 'Hex colour code for UI display', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  /**
   * Optional icon identifier for UI display.
   *
   * @example "folder"
   */
  @ApiPropertyOptional({ description: 'Icon identifier for UI display' })
  @IsOptional()
  @IsString()
  icon?: string;
}
