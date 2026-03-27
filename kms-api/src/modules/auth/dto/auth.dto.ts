import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { PATTERNS } from '../../../config/constants/app.constants';

/**
 * Login request schema
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Login request DTO for Swagger
 */
export class LoginRequestDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  email: string;

  @ApiProperty({ example: 'password123', description: 'User password' })
  password: string;
}

/**
 * Register request schema
 */
export const registerSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        PATTERNS.PASSWORD_STRONG,
        'Password must contain uppercase, lowercase, number, and special character',
      ),
    confirmPassword: z.string().optional(),
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
  })
  .refine(
    (data) => data.confirmPassword === undefined || data.password === data.confirmPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    },
  );

export type RegisterDto = z.infer<typeof registerSchema>;

/**
 * Register request DTO for Swagger
 */
export class RegisterRequestDto {
  @ApiProperty({ example: 'user@example.com', description: 'User email address' })
  email: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'Password (min 8 chars, must include uppercase, lowercase, number, special char)',
  })
  password: string;

  @ApiProperty({ example: 'Password123!', description: 'Confirm password' })
  confirmPassword: string;

  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  lastName?: string;
}

/**
 * Refresh token request schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

/**
 * Refresh token request DTO for Swagger
 */
export class RefreshTokenRequestDto {
  @ApiProperty({ description: 'Refresh token' })
  refreshToken: string;
}

/**
 * Change password schema
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(
        PATTERNS.PASSWORD_STRONG,
        'Password must contain uppercase, lowercase, number, and special character',
      ),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

/**
 * Change password request DTO for Swagger
 */
export class ChangePasswordRequestDto {
  @ApiProperty({ description: 'Current password' })
  currentPassword: string;

  @ApiProperty({ description: 'New password' })
  newPassword: string;

  @ApiProperty({ description: 'Confirm new password' })
  confirmNewPassword: string;
}

/**
 * Auth tokens response schema
 */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

/**
 * Auth tokens response DTO for Swagger
 */
export class AuthTokensResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Token expiration time in seconds' })
  expiresIn: number;

  @ApiProperty({ example: 'Bearer', description: 'Token type' })
  tokenType: 'Bearer';
}

/**
 * Logout request schema
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required').optional(),
});

export type LogoutDto = z.infer<typeof logoutSchema>;

/**
 * Create API key request schema
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  expiresAt: z.string().datetime().optional(),
  scopes: z.array(z.string()).optional(),
});

export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

/**
 * Create API key request DTO for Swagger
 */
export class CreateApiKeyRequestDto {
  @ApiProperty({ example: 'My API Key', description: 'Human-readable name for the API key' })
  name: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z', description: 'Optional expiration date (ISO 8601)' })
  expiresAt?: string;

  @ApiPropertyOptional({ example: ['read:files', 'read:search'], description: 'Optional list of scopes' })
  scopes?: string[];
}

/**
 * API key response DTO (metadata only — the plaintext key is returned only on creation)
 */
export class ApiKeyResponseDto {
  @ApiProperty({ description: 'API key ID (UUID)' })
  id: string;

  @ApiProperty({ description: 'Human-readable name' })
  name: string;

  @ApiProperty({ description: 'Key prefix (first 12 chars, safe to display)' })
  keyPrefix: string;

  @ApiProperty({ description: 'Key status', enum: ['ACTIVE', 'REVOKED', 'EXPIRED'] })
  status: string;

  @ApiProperty({ description: 'Assigned scopes' })
  scopes: string[];

  @ApiPropertyOptional({ description: 'Expiration date' })
  expiresAt?: Date;

  @ApiPropertyOptional({ description: 'Last used timestamp' })
  lastUsedAt?: Date;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

/**
 * API key creation response — includes the plaintext key ONCE
 */
export class CreateApiKeyResponseDto {
  @ApiProperty({ description: 'The plaintext API key — store it now, it will not be shown again' })
  key: string;

  @ApiProperty({ type: ApiKeyResponseDto, description: 'API key metadata' })
  apiKey: ApiKeyResponseDto;
}

/**
 * Login response with user and tokens
 */
export class LoginResponseDto {
  @ApiProperty({ type: AuthTokensResponseDto })
  tokens: AuthTokensResponseDto;

  @ApiProperty({
    example: {
      id: 'uuid',
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'USER',
    },
  })
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
}
