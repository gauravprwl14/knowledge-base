import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Standard success response schema
 */
export const successResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        requestId: z.string().optional(),
        traceId: z.string().optional(),
      })
      .optional(),
    timestamp: z.string().datetime(),
  });

/**
 * Standard error response schema
 */
export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
          value: z.any().optional(),
        }),
      )
      .optional(),
    requestId: z.string().optional(),
    traceId: z.string().optional(),
  }),
  timestamp: z.string().datetime(),
  path: z.string().optional(),
  method: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/**
 * Success response DTO for Swagger documentation
 */
export class SuccessResponseDto<T> {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty()
  data: T;

  @ApiPropertyOptional()
  meta?: {
    requestId?: string;
    traceId?: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;
}

/**
 * Error detail DTO
 */
export class ErrorDetailDto {
  @ApiProperty({ example: 'email' })
  field: string;

  @ApiProperty({ example: 'Invalid email format' })
  message: string;

  @ApiPropertyOptional({ example: 'invalid@' })
  value?: any;
}

/**
 * Error response DTO for Swagger documentation
 */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: false;

  @ApiProperty()
  error: {
    code: string;
    message: string;
    details?: ErrorDetailDto[];
    requestId?: string;
    traceId?: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({ example: '/api/v1/users' })
  path?: string;

  @ApiPropertyOptional({ example: 'POST' })
  method?: string;
}

/**
 * Message response DTO for simple operations
 */
export class MessageResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty()
  data: {
    message: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;
}

/**
 * Delete response DTO
 */
export class DeleteResponseDto {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty()
  data: {
    deleted: boolean;
    id: string;
  };

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  timestamp: string;
}
