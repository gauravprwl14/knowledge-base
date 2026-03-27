import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(500).describe('Search query string'),
  type: z.enum(['keyword', 'semantic', 'hybrid']).default('hybrid'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  user_id: z.string().min(1).describe('User ID for multi-tenancy filtering'),
  collection_ids: z.array(z.string()).optional(),
  // Legacy filter params retained for keyword search compatibility
  sourceType: z.enum(['local', 'google_drive', 'obsidian', 'note']).optional(),
  mimeType: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export class SearchResultDto {
  @ApiProperty() chunk_id!: string;
  @ApiProperty() file_id!: string;
  @ApiProperty() file_name!: string;
  @ApiProperty() content!: string;
  @ApiProperty() score!: number;
  @ApiProperty() chunk_index!: number;
  // Legacy fields retained for keyword search compatibility
  @ApiPropertyOptional() fileId?: string;
  @ApiPropertyOptional() filename?: string;
  @ApiPropertyOptional() snippet?: string;
  @ApiPropertyOptional() sourceType?: string;
  @ApiPropertyOptional() mimeType?: string | null;
  @ApiPropertyOptional() lastModified?: Date | null;
  @ApiPropertyOptional() highlights?: string[];
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] }) results!: SearchResultDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
  @ApiProperty() query!: string;
  @ApiProperty() type!: string;
  @ApiProperty() tookMs!: number;
}
