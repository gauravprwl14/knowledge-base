import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A single ranked search result representing one chunk of a document.
 */
export class SearchResult {
  @ApiProperty({ description: 'Unique chunk ID (from kms_chunks table or mock)' })
  id: string;

  @ApiProperty({ description: 'Parent file UUID (from kms_files table)' })
  fileId: string;

  @ApiProperty({ description: 'Human-readable filename' })
  filename: string;

  @ApiProperty({ description: 'Text content of the matching chunk' })
  content: string;

  @ApiProperty({
    description: 'Normalised relevance score in [0, 1] — higher is more relevant',
  })
  score: number;

  @ApiProperty({ description: 'Zero-based chunk index within the parent file' })
  chunkIndex: number;

  @ApiPropertyOptional({
    description: 'Arbitrary key-value metadata attached to the chunk',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown>;
}

/**
 * Response envelope for POST /search.
 */
export class SearchResponseDto {
  @ApiProperty({ type: [SearchResult], description: 'Ranked list of matching chunks' })
  results: SearchResult[];

  @ApiProperty({ description: 'Total number of results returned' })
  total: number;

  @ApiProperty({
    description: 'Search algorithm used: keyword | semantic | hybrid',
    example: 'hybrid',
  })
  searchType: string;

  @ApiProperty({ description: 'Wall-clock time taken to execute the search, in milliseconds' })
  took: number;
}
