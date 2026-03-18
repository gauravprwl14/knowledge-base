import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Supported search modes for the search-api.
 */
export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

/**
 * SearchQueryDto — validates query parameters for `GET /search`.
 *
 * The `userId` field is extracted from the `x-user-id` header set by the
 * kms-api gateway.  The gateway is responsible for JWT verification so
 * the search-api can remain stateless.
 */
export class SearchQueryDto {
  @ApiProperty({
    description: 'Full-text search query string',
    minLength: 1,
    example: 'machine learning fundamentals',
  })
  @IsString()
  @MinLength(1)
  q!: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results (default: 20)',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of results to skip for pagination (default: 0)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Filter results by source UUIDs',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  sourceIds?: string[];

  @ApiProperty({
    description: 'User ID from the gateway (x-user-id header)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiPropertyOptional({
    description: 'Search strategy',
    enum: ['keyword', 'semantic', 'hybrid'],
    default: 'hybrid',
  })
  @IsOptional()
  @IsEnum(['keyword', 'semantic', 'hybrid'])
  mode?: SearchMode = 'hybrid';
}
