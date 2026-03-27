import { IsString, IsNotEmpty, IsOptional, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for `POST /files/ingest`.
 *
 * Allows the Obsidian plugin (or any trusted client) to push a note's Markdown
 * content directly into the KMS indexing pipeline without going through the
 * scan-worker file-discovery flow.
 */
export class IngestNoteDto {
  /**
   * Note title / filename.
   * Used as the display name and as the `externalId` for upsert deduplication.
   * A `.md` extension is appended automatically if missing.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @ApiProperty({ description: 'Note title / filename' })
  title: string;

  /**
   * Full Markdown content of the note.
   * Passed as `inline_content` in the embed-worker message so the worker skips
   * the disk-read step.
   */
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Full markdown content of the note' })
  content: string;

  /**
   * Vault-relative path (e.g. `folder/subfolder/note.md`).
   * Falls back to `title` when omitted.
   */
  @IsString()
  @IsOptional()
  @MaxLength(2048)
  @ApiPropertyOptional({ description: 'Vault-relative path (e.g. folder/note.md)' })
  path?: string;

  /**
   * Optional collection UUID.
   * When supplied the newly created file record is added to the named collection.
   * Currently stored for future use — collection membership is not yet wired in
   * the ingest flow.
   */
  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional({ description: 'Optional collection UUID to add the note to' })
  collectionId?: string;
}
