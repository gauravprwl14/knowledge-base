import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for sending a chat message in the content refinement flow.
 *
 * Used by POST /api/v1/content/jobs/:jobId/chat
 * and POST /api/v1/content/jobs/:jobId/pieces/:pieceId/chat.
 *
 * The `message` field is limited to 4 000 characters to prevent
 * excessively large context windows from being submitted by clients.
 */
export class SendChatMessageDto {
  /**
   * The user's chat message to send to the content editing assistant.
   * Must be a non-empty string up to 4 000 characters.
   */
  @ApiProperty({
    description: 'The user message to send to the content editing assistant',
    maxLength: 4000,
    example: 'Make this LinkedIn post more concise and punchy',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
