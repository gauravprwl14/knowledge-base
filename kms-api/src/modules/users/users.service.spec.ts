import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { AppError } from '../../errors/types/app-error';
import { getLoggerToken } from 'nestjs-pino';

const mockUserRepo = {
  findUnique: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const userId = 'user-uuid-001';

const mockUser = {
  id: userId,
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  role: 'USER',
  emailVerified: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  passwordHash: 'REDACTED', // never returned to client
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: getLoggerToken(UsersService.name), useValue: mockLogger },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getProfile', () => {
    it('returns user profile for a valid userId', async () => {
      mockUserRepo.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);
      expect(result.id).toBe(userId);
      expect(result.email).toBe('test@example.com');
    });

    it('does not expose passwordHash in the response', async () => {
      mockUserRepo.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId) as any;
      expect(result.passwordHash).toBeUndefined();
    });

    it('throws AppError 404 when user not found', async () => {
      mockUserRepo.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing-id')).rejects.toThrow(AppError);
    });

    it('calls findUnique with the correct userId', async () => {
      mockUserRepo.findUnique.mockResolvedValue(mockUser);

      await service.getProfile(userId);
      expect(mockUserRepo.findUnique).toHaveBeenCalledWith({ id: userId });
    });
  });
});
