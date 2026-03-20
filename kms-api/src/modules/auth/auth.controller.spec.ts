import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  refreshToken: jest.fn(),
  changePassword: jest.fn(),
  logout: jest.fn(),
};

const mockTokens = {
  accessToken: 'access.jwt.token',
  refreshToken: 'refresh.jwt.token',
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('register', () => {
    it('delegates to authService.register and returns created user + tokens', async () => {
      const dto = { email: 'new@example.com', password: 'Password1!', name: 'Test User' };
      const created = { user: { id: 'u-1', email: dto.email, name: dto.name }, tokens: mockTokens };
      mockAuthService.register.mockResolvedValue(created);

      const result = await controller.register(dto as any) as any;
      expect(result.tokens.accessToken).toBeDefined();
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });

    it('propagates service error on duplicate email', async () => {
      mockAuthService.register.mockRejectedValue(new Error('Email already in use'));
      await expect(controller.register({ email: 'dup@example.com' } as any)).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('delegates to authService.login and returns tokens', async () => {
      const dto = { email: 'user@example.com', password: 'correctpass' };
      mockAuthService.login.mockResolvedValue({ user: { id: 'u-1' }, tokens: mockTokens });

      const result = await controller.login(dto as any);
      expect(result.tokens).toEqual(mockTokens);
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshToken', async () => {
      const dto = { refreshToken: 'valid.refresh.token' };
      mockAuthService.refreshToken.mockResolvedValue(mockTokens);

      const result = await controller.refresh(dto as any) as any;
      expect(result.accessToken).toBeDefined();
    });
  });

  describe('changePassword', () => {
    it('calls authService.changePassword with userId and dto', async () => {
      const dto = { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' };
      mockAuthService.changePassword.mockResolvedValue({ message: 'Password changed' });

      const result = await controller.changePassword('user-1', dto as any);
      expect(mockAuthService.changePassword).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('logout', () => {
    it('calls authService.logout', async () => {
      const dto = { refreshToken: 'token' };
      mockAuthService.logout.mockResolvedValue({ message: 'Logged out' });

      await controller.logout('user-1', dto as any);
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1', 'token');
    });
  });
});
