import { ApiProperty } from "@nestjs/swagger";

/**
 * A single document fragment returned by a search query.
 *
 * The `snippet` field contains a ≤ 160-character excerpt from the source
 * file with matching terms wrapped in `<mark>…</mark>` tags (for keyword
 * search) or plain text (for semantic search).
 */
export class SearchResultItemDto {
  @ApiProperty({
    description: "File UUID",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  fileId!: string;

  @ApiProperty({
    description: "Original filename",
    example: "annual-report-2024.pdf",
  })
  filename!: string;

  @ApiProperty({ description: "MIME type", example: "application/pdf" })
  mimeType!: string;

  @ApiProperty({
    description: "Source UUID",
    example: "550e8400-e29b-41d4-a716-446655440001",
  })
  sourceId!: string;

  @ApiProperty({
    description: "Relevance score (higher = more relevant)",
    example: 0.87,
  })
  score!: number;

  @ApiProperty({
    description:
      "Up to 160-character excerpt from the file. " +
      "Keyword results wrap matched terms in <mark> tags.",
    example:
      "The study demonstrates <mark>machine learning</mark> techniques applied to…",
  })
  snippet!: string;

  @ApiProperty({
    description: "Zero-based index of the matched chunk within the file",
    example: 3,
  })
  chunkIndex!: number;
}

/**
 * Top-level search response envelope.
 */
export class SearchResponseDto {
  @ApiProperty({
    type: [SearchResultItemDto],
    description: "Ordered list of search results",
  })
  results!: SearchResultItemDto[];

  @ApiProperty({ description: "Total number of results returned", example: 12 })
  total!: number;

  @ApiProperty({
    description: "Query execution time in milliseconds",
    example: 42,
  })
  took_ms!: number;

  @ApiProperty({
    description: "Search mode that was executed",
    enum: ["keyword", "semantic", "hybrid"],
    example: "hybrid",
  })
  mode!: string;
}
