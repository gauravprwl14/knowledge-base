import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response shape for a single KMS file.
 *
 * All fields mirror the `kms_files` table columns. `sizeBytes` is serialised
 * as a string because BigInt is not JSON-serialisable by default.
 */
export class FileResponseDto {
  /** File UUID */
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id!: string;

  /** Owner user UUID */
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  userId!: string;

  /** Source UUID this file was discovered in */
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174002' })
  sourceId!: string;

  /** Original file name */
  @ApiProperty({ example: 'quarterly-report.pdf' })
  name!: string;

  /** Full path within the source */
  @ApiProperty({ example: '/documents/quarterly-report.pdf' })
  path!: string;

  /** MIME type of the file */
  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  /** File size in bytes (serialised as string due to BigInt) */
  @ApiProperty({ example: '1048576' })
  sizeBytes!: string;

  /** SHA-256 checksum of the file content */
  @ApiPropertyOptional({ example: 'abc123...' })
  checksumSha256?: string | null;

  /** Processing status */
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'INDEXED', 'ERROR'], example: 'INDEXED' })
  status!: string;

  /** Optional junk classification status */
  @ApiPropertyOptional({ enum: ['FLAGGED', 'CONFIRMED', 'DISMISSED'] })
  junkStatus?: string | null;

  /** External ID in the source system (e.g. Google Drive file ID) */
  @ApiPropertyOptional({ example: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' })
  externalId?: string | null;

  /** Web view link in the source system */
  @ApiPropertyOptional({ example: 'https://docs.google.com/...' })
  webViewLink?: string | null;

  /** Timestamp when the file was fully indexed into Qdrant */
  @ApiPropertyOptional()
  indexedAt?: Date | null;

  /** Record creation timestamp */
  @ApiProperty()
  createdAt!: Date;

  /** Record last-updated timestamp */
  @ApiProperty()
  updatedAt!: Date;
}

/**
 * Paginated file list response.
 */
export class FilePageResponseDto {
  /** Current page of files */
  @ApiProperty({ type: [FileResponseDto] })
  items!: FileResponseDto[];

  /**
   * Opaque cursor for the next page.
   * Pass this as the `cursor` query param in the next request.
   * `null` when this is the last page.
   */
  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;

  /** Total number of files matching the filters (unpaginated count) */
  @ApiProperty({ example: 142 })
  total!: number;
}
