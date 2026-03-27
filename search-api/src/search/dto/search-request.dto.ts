import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Supported search modes. */
export enum SearchType {
  KEYWORD = 'keyword',
  SEMANTIC = 'semantic',
  HYBRID = 'hybrid',
}

/**
 * Request body for POST /search.
 *
 * `userId` is NOT in the body — it is extracted from the `x-user-id` header
 * by the controller and injected before the service call.
 */
export class SearchRequestDto {
  @ApiProperty({ description: 'Search query string', example: 'RAG pipeline architecture' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results to return (1–50)',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Restrict results to specific source IDs',
    type: [String],
    example: ['src_abc123'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceIds?: string[];

  @ApiPropertyOptional({
    description: 'Search algorithm: keyword (BM25), semantic (vector), or hybrid (RRF fusion)',
    enum: SearchType,
    default: SearchType.HYBRID,
  })
  @IsOptional()
  @IsEnum(SearchType)
  searchType?: SearchType = SearchType.HYBRID;
}
