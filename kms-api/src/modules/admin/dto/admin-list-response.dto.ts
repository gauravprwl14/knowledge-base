import { ApiProperty } from '@nestjs/swagger';

/**
 * AdminListResponseDto<T> — generic cursor-paginated envelope for admin list endpoints.
 *
 * Pass `nextCursor` back as `?cursor=` on the next request to page through results.
 * `nextCursor` is `null` when the last page has been reached.
 */
export class AdminListResponseDto<T> {
  /** Array of items in this page. */
  @ApiProperty({ isArray: true })
  data: T[];

  /**
   * Opaque cursor — pass as `?cursor=` for the next page.
   * `null` indicates there are no more pages.
   */
  @ApiProperty({ nullable: true, description: 'Pass as ?cursor= for next page; null = last page' })
  nextCursor: string | null;

  /** Total number of matching records across all pages. */
  @ApiProperty({ description: 'Total matching records (all pages)' })
  total: number;
}

// ---------------------------------------------------------------------------
// Admin user item
// ---------------------------------------------------------------------------

/** A single user row returned by GET /admin/users. */
export class AdminUserItemDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true }) firstName: string | null;
  @ApiProperty({ nullable: true }) lastName: string | null;
  @ApiProperty() role: string;
  @ApiProperty() status: string;
  @ApiProperty() createdAt: string;
  @ApiProperty({ nullable: true }) lastLoginAt: string | null;
}

// ---------------------------------------------------------------------------
// Admin source item
// ---------------------------------------------------------------------------

/** A single source row returned by GET /admin/sources. */
export class AdminSourceItemDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true }) userEmail: string | null;
  @ApiProperty() type: string;
  @ApiProperty() name: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) lastScannedAt: string | null;
  @ApiProperty() fileCount: number;
}

// ---------------------------------------------------------------------------
// Admin scan job item
// ---------------------------------------------------------------------------

/** A single scan job row returned by GET /admin/scan-jobs. */
export class AdminScanJobItemDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true }) userEmail: string | null;
  @ApiProperty() sourceId: string;
  @ApiProperty({ nullable: true }) sourceName: string | null;
  @ApiProperty() type: string;
  @ApiProperty() status: string;
  @ApiProperty({ nullable: true }) startedAt: string | null;
  @ApiProperty({ nullable: true }) finishedAt: string | null;
  @ApiProperty() filesFound: number;
}
