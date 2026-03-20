import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({ default: { ttl: 60000, limit: 5 } })
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
  @Throttle({ default: { ttl: 60000, limit: 10 } })
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
  @Throttle({ default: { ttl: 60000, limit: 20 } })
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
  @Throttle({ default: { ttl: 60000, limit: 30 } })
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
   * Google OAuth callback — exchanges code for tokens and redirects to the
   * frontend callback page.
   *
   * After Passport validates the Google profile, this handler issues JWT tokens
   * and redirects the browser to `/kms/en/auth/callback?accessToken=...` so the
   * frontend can bootstrap the auth store without an extra API round-trip.
   *
   * NOTE: `@Res({ passthrough: false })` gives direct access to the Fastify
   * reply so we can call `reply.redirect()` ourselves.  NestJS will NOT attempt
   * to write a second response because we own the reply.
   */
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get('google/callback')
  @ApiEndpoint({
    summary: 'Google OAuth callback',
    description: 'Handles the Google OAuth callback and redirects to the frontend with JWT tokens',
    responses: [
      { status: HttpStatus.FOUND, description: 'Redirects to frontend callback page' },
      { status: HttpStatus.UNAUTHORIZED, description: 'OAuth authentication failed' },
    ],
  })
  async googleCallback(
    @Req() req: { user: import('@prisma/client').User },
    @Res() reply: FastifyReply,
  ): Promise<void> {
    try {
      // req.user is populated by GoogleAuthGuard → GoogleStrategy.validate()
      console.error('[GoogleCallback] req.user:', JSON.stringify(req?.user ?? null));
      const result = await this.authService.googleLogin(req.user);

      // Redirect browser to the frontend OAuth callback page.
      const params = new URLSearchParams({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
      });
      const redirectUrl = `/kms/en/auth/callback?${params.toString()}`;
      console.error('[GoogleCallback] redirecting to:', redirectUrl.substring(0, 60));
      reply.redirect(redirectUrl, 302);
    } catch (err) {
      const e = err as Error;
      console.error('[GoogleCallback] ERROR:', e?.message, e?.stack);
      throw err;
    }
  }
}
