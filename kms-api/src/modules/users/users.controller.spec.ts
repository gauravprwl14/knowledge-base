import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserProfileResponseDto } from './dto/users.dto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProfile: UserProfileResponseDto = {
  id: USER_ID,
  email: 'user@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
};

// ---------------------------------------------------------------------------
// Mock service
// ---------------------------------------------------------------------------

const mockUsersService = {
  getProfile: jest.fn(),
};

// ---------------------------------------------------------------------------
// Module setup
// ---------------------------------------------------------------------------

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  // =========================================================================
  // JwtAuthGuard wiring
  // =========================================================================

  describe('JwtAuthGuard', () => {
    it('is applied at the controller level so all routes require authentication', async () => {
      const denyGuard = { canActivate: jest.fn().mockReturnValue(false) };

      const blockedModule: TestingModule = await Test.createTestingModule({
        controllers: [UsersController],
        providers: [{ provide: UsersService, useValue: mockUsersService }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue(denyGuard)
        .compile();

      const blockedController = blockedModule.get<UsersController>(UsersController);
      expect(blockedController).toBeDefined();
      expect(denyGuard.canActivate()).toBe(false);
    });
  });

  // =========================================================================
  // GET /users/me
  // =========================================================================

  describe('getMe()', () => {
    it('delegates to usersService.getProfile with the userId from JWT', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getMe(USER_ID);

      expect(mockUsersService.getProfile).toHaveBeenCalledWith(USER_ID);
      expect(result).toEqual(mockProfile);
    });

    it('returns the full user profile including id, email, name, role, and createdAt', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);

      const result = await controller.getMe(USER_ID);

      expect(result.id).toBe(USER_ID);
      expect(result.email).toBe('user@example.com');
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(result.role).toBe('USER');
      expect(result.emailVerified).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('passes the exact userId from the @CurrentUser decorator to the service', async () => {
      mockUsersService.getProfile.mockResolvedValue(mockProfile);

      await controller.getMe(USER_ID);

      const [capturedUserId] = mockUsersService.getProfile.mock.calls[0];
      expect(capturedUserId).toBe(USER_ID);
    });

    it('returns profile with null firstName when the user has not set a first name', async () => {
      const profileWithoutName = { ...mockProfile, firstName: null, lastName: null };
      mockUsersService.getProfile.mockResolvedValue(profileWithoutName);

      const result = await controller.getMe(USER_ID);

      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });

    it('returns profile with ADMIN role for admin users', async () => {
      const adminProfile = { ...mockProfile, role: 'ADMIN' };
      mockUsersService.getProfile.mockResolvedValue(adminProfile);

      const result = await controller.getMe(USER_ID);

      expect(result.role).toBe('ADMIN');
    });

    it('propagates errors from usersService.getProfile (e.g. user not found 404)', async () => {
      const err = new Error('User not found');
      mockUsersService.getProfile.mockRejectedValue(err);

      await expect(controller.getMe('nonexistent-id')).rejects.toThrow('User not found');
    });

    it('propagates any internal error from usersService.getProfile', async () => {
      const err = new Error('Database connection failed');
      mockUsersService.getProfile.mockRejectedValue(err);

      await expect(controller.getMe(USER_ID)).rejects.toThrow('Database connection failed');
    });
  });
});
