import { ApiProperty } from '@nestjs/swagger';

/**
 * A single file item returned in the list response.
 * Field names mirror the kms_files table columns.
 */
export class FileItemDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() sourceId: string;
  @ApiProperty() name: string;
  @ApiProperty() path: string;
  @ApiProperty() mimeType: string;
  @ApiProperty() sizeBytes: string; // BigInt serialised as string
  @ApiProperty({ nullable: true }) checksumSha256: string | null;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) junkStatus: string | null;
  @ApiProperty({ nullable: true }) externalId: string | null;
  @ApiProperty({ nullable: true }) webViewLink: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

/**
 * ListFilesResponseDto — envelope for GET /files.
 *
 * Cursor-paginated: pass `nextCursor` back as `?cursor=` on the next request.
 * `nextCursor` is null when the last page has been reached.
 */
export class ListFilesResponseDto {
  @ApiProperty({ type: [FileItemDto] })
  items: FileItemDto[];

  @ApiProperty({ nullable: true, description: 'Opaque cursor — pass as ?cursor= for next page' })
  nextCursor: string | null;

  @ApiProperty({ description: 'Total matching records (across all pages)' })
  total: number;
}
