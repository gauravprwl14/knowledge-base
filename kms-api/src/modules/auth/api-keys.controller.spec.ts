import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeysController } from './api-keys.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CreateApiKeyDto, CreateApiKeyResponseDto, ApiKeyResponseDto } from './dto/auth.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const KEY_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockApiKeyMeta: ApiKeyResponseDto = {
  id: KEY_ID,
  name: 'My Integration Key',
  keyPrefix: 'kms_live_123',
  status: 'ACTIVE',
  scopes: ['read:files'],
  expiresAt: undefined,
  lastUsedAt: undefined,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
};

const mockCreateResponse: CreateApiKeyResponseDto = {
  key: 'kms_live_123abc456def789ghi',
  apiKey: mockApiKeyMeta,
};

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockAuthService = {
  createApiKey: jest.fn(),
  listApiKeys: jest.fn(),
  revokeApiKey: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('ApiKeysController', () => {
  let controller: ApiKeysController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // JwtAuthGuard wiring
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level so all routes require authentication', async () => {
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [ApiKeysController],
        providers: [{ provide: AuthService, useValue: mockAuthService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      const blockedController = blockedModule.get<ApiKeysController>(ApiKeysController);
      expect(blockedController).toBeDefined();
      expect(denyGuard.canActivate()).toBe(false);
    });
  });

  // =========================================================================
  // POST /auth/api-keys
  // =========================================================================

  describe('createApiKey()', () => {
    const dto: CreateApiKeyDto = { name: 'My Integration Key' };

    it('delegates to authService.createApiKey with userId and dto', async () => {
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      const result = await controller.createApiKey(USER_ID, dto);

      expect(mockAuthService.createApiKey).toHaveBeenCalledWith(USER_ID, dto);
      expect(result).toEqual(mockCreateResponse);
    });

    it('returns the plaintext key in the response', async () => {
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      const result = await controller.createApiKey(USER_ID, dto);

      expect(result.key).toBe('kms_live_123abc456def789ghi');
    });

    it('returns the API key metadata in the response', async () => {
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      const result = await controller.createApiKey(USER_ID, dto);

      expect(result.apiKey.id).toBe(KEY_ID);
      expect(result.apiKey.status).toBe('ACTIVE');
    });

    it('uses userId from the JWT (@CurrentUser), not from the body', async () => {
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      await controller.createApiKey(USER_ID, dto);

      const [capturedUserId] = mockAuthService.createApiKey.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('forwards an optional expiresAt in the dto', async () => {
      const dtoWithExpiry: CreateApiKeyDto = {
        name: 'Expiring Key',
        expiresAt: '2026-12-31T23:59:59Z',
      };
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      await controller.createApiKey(USER_ID, dtoWithExpiry);

      const [, capturedDto] = mockAuthService.createApiKey.mock.calls[0];
      expect(capturedDto.expiresAt).toBe('2026-12-31T23:59:59Z');
    });

    it('forwards optional scopes in the dto', async () => {
      const dtoWithScopes: CreateApiKeyDto = {
        name: 'Scoped Key',
        scopes: ['read:files', 'read:search'],
      };
      mockAuthService.createApiKey.mockResolvedValue(mockCreateResponse);

      await controller.createApiKey(USER_ID, dtoWithScopes);

      const [, capturedDto] = mockAuthService.createApiKey.mock.calls[0];
      expect(capturedDto.scopes).toEqual(['read:files', 'read:search']);
    });

    it('propagates errors from authService.createApiKey (e.g. limit reached)', async () => {
      const err = new Error('API key limit reached');
      mockAuthService.createApiKey.mockRejectedValue(err);

      await expect(controller.createApiKey(USER_ID, dto)).rejects.toThrow(
        'API key limit reached',
      );
    });
  });

  // =========================================================================
  // GET /auth/api-keys
  // =========================================================================

  describe('listApiKeys()', () => {
    it('delegates to authService.listApiKeys with userId from JWT', async () => {
      mockAuthService.listApiKeys.mockResolvedValue([mockApiKeyMeta]);

      const result = await controller.listApiKeys(USER_ID);

      expect(mockAuthService.listApiKeys).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual([mockApiKeyMeta]);
    });

    it('returns an empty array when the user has no API keys', async () => {
      mockAuthService.listApiKeys.mockResolvedValue([]);

      const result = await controller.listApiKeys(USER_ID);

      expect(result).toHaveLength(0);
    });

    it('returns multiple keys when the user has several', async () => {
      const secondKey = { ...mockApiKeyMeta, id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', name: 'Second Key' };
      mockAuthService.listApiKeys.mockResolvedValue([mockApiKeyMeta, secondKey]);

      const result = await controller.listApiKeys(USER_ID);

      expect(result).toHaveLength(2);
    });

    it('does NOT return plaintext key values in the list (metadata only)', async () => {
      mockAuthService.listApiKeys.mockResolvedValue([mockApiKeyMeta]);

      const result = await controller.listApiKeys(USER_ID);

      // Ensure the returned items conform to ApiKeyResponseDto (no `key` field)
      const item = result[0] as any;
      expect(item.key).toBeUndefined();
    });

    it('propagates errors from authService.listApiKeys', async () => {
      const err = new Error('Database error');
      mockAuthService.listApiKeys.mockRejectedValue(err);

      await expect(controller.listApiKeys(USER_ID)).rejects.toThrow('Database error');
    });
  });

  // =========================================================================
  // DELETE /auth/api-keys/:id
  // =========================================================================

  describe('revokeApiKey()', () => {
    it('delegates to authService.revokeApiKey with userId and keyId', async () => {
      mockAuthService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(USER_ID, KEY_ID);

      expect(mockAuthService.revokeApiKey).toHaveBeenCalledWith(USER_ID, KEY_ID);
    });

    it('resolves to undefined (204 No Content body is empty)', async () => {
      mockAuthService.revokeApiKey.mockResolvedValue(undefined);

      const result = await controller.revokeApiKey(USER_ID, KEY_ID);

      expect(result).toBeUndefined();
    });

    it('uses userId from the JWT (@CurrentUser), enforcing ownership', async () => {
      mockAuthService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(USER_ID, KEY_ID);

      const [capturedUserId] = mockAuthService.revokeApiKey.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('passes the exact keyId from the route parameter', async () => {
      mockAuthService.revokeApiKey.mockResolvedValue(undefined);

      await controller.revokeApiKey(USER_ID, KEY_ID);

      const [, capturedKeyId] = mockAuthService.revokeApiKey.mock.calls[0];
      expect(capturedKeyId).toBe(KEY_ID);
    });

    it('propagates errors from authService.revokeApiKey (e.g. key not found)', async () => {
      const err = new Error('API key not found');
      mockAuthService.revokeApiKey.mockRejectedValue(err);

      await expect(controller.revokeApiKey(USER_ID, 'nonexistent-id')).rejects.toThrow(
        'API key not found',
      );
    });
  });
});
