import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * User profile response DTO
 */
export class UserProfileResponseDto {
  @ApiProperty({ description: 'User UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  email: string;

  @ApiPropertyOptional({ description: 'First name', example: 'John' })
  firstName: string | null;

  @ApiPropertyOptional({ description: 'Last name', example: 'Doe' })
  lastName: string | null;

  @ApiProperty({ description: 'User role', enum: ['ADMIN', 'USER', 'SERVICE_ACCOUNT'], example: 'USER' })
  role: string;

  @ApiProperty({ description: 'Whether the email has been verified', example: true })
  emailVerified: boolean;

  @ApiProperty({ description: 'Account creation timestamp', example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}
