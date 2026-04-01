import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for requesting an additional variation of an existing content piece.
 *
 * The `instruction` field is forwarded to the content-worker as a style or
 * tone override, allowing the user to ask for a shorter version, a different
 * tone, etc. without editing the piece directly.
 */
export class GenerateVariationDto {
  /**
   * Optional instruction override for the variation.
   *
   * When provided, the worker appends this instruction to the generation
   * prompt so the new variation differs from the primary in the requested way.
   *
   * @example "Make it more conversational and under 200 words"
   */
  @ApiPropertyOptional({
    description: 'Optional instruction for the variation (e.g. "shorter", "more formal")',
    example: 'Make it more conversational and under 200 words',
  })
  @IsOptional()
  @IsString()
  instruction?: string;
}
