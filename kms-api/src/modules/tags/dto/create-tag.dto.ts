import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, Matches, MinLength } from 'class-validator';

/**
 * CreateTagDto — payload for POST /tags.
 *
 * The `color` must be a valid 6-digit hex colour string (e.g. "#6366f1").
 * It defaults to Indigo-500 (#6366f1) in the service if omitted or invalid.
 */
export class CreateTagDto {
  /** Human-readable tag name. Must be 1-50 characters. */
  @ApiProperty({ description: 'Tag name (1-50 characters)', example: 'design' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  /** Hex colour used for rendering the tag badge in the UI. */
  @ApiPropertyOptional({
    description: 'Tag colour as a 6-digit hex string',
    example: '#6366f1',
    default: '#6366f1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a valid hex colour, e.g. #6366f1' })
  color?: string;
}
