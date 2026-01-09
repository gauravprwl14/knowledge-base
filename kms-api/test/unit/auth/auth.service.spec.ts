import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { UserRepository } from '../../../src/database/repositories/user.repository';
import { AppConfigService } from '../../../src/config/config.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { UserStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<UserRepository>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Test',
    lastName: 'User',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    lastLoginAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: {
            findByEmail: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findUnique: jest.fn(),
            updateLastLogin: jest.fn(),
            incrementFailedLogin: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            auth: {
              jwtAccessSecret: 'test-access-secret',
              jwtAccessExpiration: '15m',
              jwtRefreshSecret: 'test-refresh-secret',
              jwtRefreshExpiration: '7d',
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(UserRepository);
    jwtService = module.get(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should create a new user', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        firstName: 'New',
        lastName: 'User',
      };

      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(mockUser);

      const result = await service.register(registerDto);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(userRepository.create).toHaveBeenCalled();
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw error if email already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
      };

      userRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow();
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      // Mock bcrypt.compare to return true
      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true) as any);

      userRepository.findByEmail.mockResolvedValue(mockUser);
      userRepository.updateLastLogin.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('mock-token');

      const result = await service.login(loginDto);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(userRepository.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
      expect(result).toHaveProperty('tokens');
      expect(result).toHaveProperty('user');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
    });

    it('should throw error for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(false) as any);

      userRepository.findByEmail.mockResolvedValue(mockUser);

      await expect(service.login(loginDto)).rejects.toThrow();
      expect(userRepository.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      const loginDto = {
        email: 'notfound@example.com',
        password: 'Password123!',
      };

      userRepository.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow();
    });
  });
});
