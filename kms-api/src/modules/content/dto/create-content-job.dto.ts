import {
  IsEnum,
  IsOptional,
  IsUrl,
  IsUUID,
  IsArray,
  IsString,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentSourceType } from '@prisma/client';

/**
 * DTO for creating a new content generation job.
 *
 * Validation rules enforce source-type–specific fields:
 *   - YOUTUBE / URL  → `sourceUrl` is required
 *   - KMS_FILE / DOCUMENT / VIDEO  → `sourceFileId` is required
 */
export class CreateContentJobDto {
  /**
   * The type of source driving this content job.
   * Determines which ingestion pipeline is activated on the worker side.
   */
  @ApiProperty({
    enum: ContentSourceType,
    description: 'Source type for content ingestion (YOUTUBE, URL, VIDEO, DOCUMENT, KMS_FILE)',
    example: 'YOUTUBE',
  })
  @IsEnum(ContentSourceType)
  sourceType!: ContentSourceType;

  /**
   * URL of the source. Required when sourceType is YOUTUBE or URL.
   * Must be a valid absolute URL.
   */
  @ApiPropertyOptional({
    description: 'Source URL — required when sourceType is YOUTUBE or URL',
    example: 'https://www.youtube.com/watch?v=abc123',
  })
  @IsOptional()
  // sourceUrl is required when sourceType is YOUTUBE or URL
  @ValidateIf((o: CreateContentJobDto) => o.sourceType === ContentSourceType.YOUTUBE || o.sourceType === ContentSourceType.URL)
  @IsUrl({}, { message: 'sourceUrl must be a valid URL' })
  sourceUrl?: string;

  /**
   * UUID of an existing KMS file to use as source.
   * Required when sourceType is KMS_FILE, DOCUMENT, or VIDEO.
   */
  @ApiPropertyOptional({
    description: 'KMS file UUID — required when sourceType is KMS_FILE, DOCUMENT, or VIDEO',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  // sourceFileId is required when sourceType is KMS_FILE, DOCUMENT, or VIDEO
  @ValidateIf(
    (o: CreateContentJobDto) =>
      o.sourceType === ContentSourceType.KMS_FILE ||
      o.sourceType === ContentSourceType.DOCUMENT ||
      o.sourceType === ContentSourceType.VIDEO,
  )
  @IsUUID('4', { message: 'sourceFileId must be a valid UUID v4' })
  sourceFileId?: string;

  /**
   * Optional tags to attach to the job for organisational purposes.
   * Max 20 tags, each a non-empty string up to 100 chars.
   */
  @ApiPropertyOptional({
    description: 'Optional tags for the job',
    type: [String],
    example: ['typescript', 'nestjs'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
