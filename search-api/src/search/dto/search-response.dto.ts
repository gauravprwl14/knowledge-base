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

  @ApiProperty({ description: 'Text content of the matching chunk (also serves as the snippet)' })
  content: string;

  @ApiProperty({
    description: 'Normalised relevance score in [0, 1] — higher is more relevant',
  })
  score: number;

  @ApiProperty({ description: 'Zero-based chunk index within the parent file' })
  chunkIndex: number;

  @ApiPropertyOptional({
    description: 'Google Drive or external web-view URL for the source file',
  })
  webViewLink?: string;

  @ApiPropertyOptional({
    description: 'Playback offset in seconds — populated for voice transcript chunks',
  })
  startSecs?: number;

  @ApiPropertyOptional({
    description: 'Source type of the originating document: google_drive | voice_transcript | local',
  })
  sourceType?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary key-value metadata attached to the chunk',
    type: 'object',
    additionalProperties: true,
  })
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Google Drive or external web-view URL for the source file',
  })
  webViewLink?: string;

  @ApiPropertyOptional({
    description: 'Start timestamp in seconds — populated for voice transcript chunks',
  })
  startSecs?: number;

  @ApiPropertyOptional({
    description: 'Source type of the parent file (e.g. "google_drive", "local", "obsidian")',
  })
  sourceType?: string;
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
