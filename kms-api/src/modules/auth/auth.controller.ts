import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginDto,
  LoginRequestDto,
  LoginResponseDto,
  RegisterDto,
  RegisterRequestDto,
  RefreshTokenDto,
  RefreshTokenRequestDto,
  AuthTokensResponseDto,
  ChangePasswordDto,
  ChangePasswordRequestDto,
  LogoutDto,
  logoutSchema,
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  changePasswordSchema,
} from './dto/auth.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';

/**
 * Authentication Controller
 *
 * Handles authentication operations:
 * - POST /auth/register - Register new user
 * - POST /auth/login - User login
 * - POST /auth/refresh - Refresh tokens
 * - POST /auth/change-password - Change password
 */
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user
   */
  @Public()
  @Post('register')
  @ApiEndpoint({
    summary: 'Register new user',
    description: 'Creates a new user account with email and password',
    successStatus: HttpStatus.CREATED,
    responses: [
      { status: HttpStatus.CONFLICT, description: 'Email already exists' },
    ],
  })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDto,
  ) {
    return this.authService.register(dto);
  }

  /**
   * User login
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'User login',
    description: 'Authenticates user and returns JWT tokens',
    responseType: LoginResponseDto,
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'Invalid credentials' },
    ],
  })
  async login(@Body(new ZodValidationPipe(loginSchema)) dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * Refresh access token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Refresh tokens',
    description: 'Refreshes access token using refresh token',
    responseType: AuthTokensResponseDto,
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'Invalid or expired refresh token' },
    ],
  })
  async refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) dto: RefreshTokenDto,
  ) {
    return this.authService.refreshToken(dto);
  }

  /**
   * Change password
   */
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiEndpoint({
    summary: 'Change password',
    description: 'Changes the password for the authenticated user',
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'Invalid current password' },
    ],
  })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  /**
   * Logout — invalidates the user's refresh token(s)
   */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('jwt')
  @ApiEndpoint({
    summary: 'Logout',
    description: 'Invalidates the refresh token(s) for the authenticated user',
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' },
    ],
  })
  async logout(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(logoutSchema)) dto: LogoutDto,
  ) {
    await this.authService.logout(userId, dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  /**
   * Initiates Google OAuth 2.0 flow — redirects to Google's consent screen
   */
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google')
  @ApiEndpoint({
    summary: 'Google OAuth login',
    description: 'Redirects the browser to Google for OAuth authentication',
  })
  googleLogin() {
    // Guard handles the redirect — this handler body is never reached
  }

  /**
   * Google OAuth callback — exchanges code for tokens and returns JWT tokens
   */
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiEndpoint({
    summary: 'Google OAuth callback',
    description: 'Handles the Google OAuth callback and returns JWT tokens',
    responseType: LoginResponseDto,
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'OAuth authentication failed' },
    ],
  })
  async googleCallback(@Req() req: { user: import('@prisma/client').User }): Promise<{ tokens: import('./dto/auth.dto').AuthTokens; user: { id: string; email: string; firstName: string | null; lastName: string | null; role: string } }> {
    // req.user is set by GoogleAuthGuard → GoogleStrategy.validate()
    return this.authService.googleLogin(req.user);
  }
}
