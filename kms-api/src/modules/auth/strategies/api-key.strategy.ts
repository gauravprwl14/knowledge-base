import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { createHash } from 'crypto';
import { ApiKeyRepository } from '../../../database/repositories/api-key.repository';
import { ErrorFactory } from '../../../errors/types/error-factory';
import { ERROR_CODES } from '../../../errors/error-codes';
import { AUTH } from '../../../config/constants/app.constants';
import { ApiKeyStatus, UserStatus } from '@prisma/client';

/**
 * API Key Strategy for Passport authentication
 *
 * Validates API keys from X-API-Key header.
 *
 * @example
 * ```typescript
 * @UseGuards(ApiKeyAuthGuard)
 * @Get('data')
 * getData(@CurrentApiKey() apiKey: ApiKey) {
 *   return this.service.getData();
 * }
 * ```
 */
@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeyRepository: ApiKeyRepository) {
    super();
  }

  /**
   * Validates API key from request headers
   * @param req - Express request object
   * @returns User and API key entities
   * @throws UnauthorizedException if API key is invalid
   */
  async validate(req: Request): Promise<any> {
    const apiKeyHeader = req.headers[AUTH.API_KEY_HEADER] as string;

    if (!apiKeyHeader) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_INVALID.code,
        'API key is required',
      );
    }

    // Validate API key format
    if (!apiKeyHeader.startsWith(AUTH.API_KEY_PREFIX)) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_INVALID.code,
        'Invalid API key format',
      );
    }

    // Hash the API key
    const keyHash = this.hashApiKey(apiKeyHeader);

    // Find API key in database
    const apiKeyRecord = await this.apiKeyRepository.findActiveByHash(keyHash);

    if (!apiKeyRecord) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_INVALID.code,
        'Invalid API key',
      );
    }

    // Check if expired
    if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_EXPIRED.code,
        'API key has expired',
      );
    }

    // Check API key status
    if (apiKeyRecord.status === ApiKeyStatus.REVOKED) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.API_KEY_REVOKED.code,
        'API key has been revoked',
      );
    }

    // Check user status
    if (apiKeyRecord.user.status !== UserStatus.ACTIVE) {
      throw ErrorFactory.authentication(
        ERROR_CODES.AUT.ACCOUNT_SUSPENDED.code,
        'Associated account is not active',
      );
    }

    // Record API key usage (async, don't wait)
    this.apiKeyRepository
      .recordUsage(apiKeyRecord.id, req.ip)
      .catch((err) => console.error('Failed to record API key usage:', err));

    // Return user and API key
    return {
      user: {
        id: apiKeyRecord.user.id,
        email: apiKeyRecord.user.email,
        role: apiKeyRecord.user.role,
      },
      apiKey: {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        scopes: apiKeyRecord.scopes,
      },
    };
  }

  /**
   * Hashes an API key using SHA-256
   * @param apiKey - Raw API key
   * @returns Hashed API key
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}
