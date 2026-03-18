import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for partially updating an existing KMS collection.
 *
 * All fields are optional — only provided fields are updated.
 */
export class UpdateCollectionDto {
  /**
   * New name for the collection.
   *
   * @example "Updated Research Papers"
   */
  @ApiPropertyOptional({ description: 'Collection name', minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /**
   * Updated description of the collection.
   *
   * @example "ML papers — updated scope"
   */
  @ApiPropertyOptional({ description: 'Collection description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /**
   * Updated hex colour code for UI display.
   *
   * @example "#10B981"
   */
  @ApiPropertyOptional({ description: 'Hex colour code for UI display', maxLength: 7 })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  /**
   * Updated icon identifier for UI display.
   *
   * @example "bookmark"
   */
  @ApiPropertyOptional({ description: 'Icon identifier for UI display' })
  @IsOptional()
  @IsString()
  icon?: string;
}
