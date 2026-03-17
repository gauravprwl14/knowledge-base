import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { ApiKeysController } from './api-keys.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { CombinedAuthGuard } from './guards/combined-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';

/**
 * AuthModule provides authentication functionality:
 * - JWT authentication (Bearer token)
 * - API Key authentication (X-API-Key header)
 * - Google OAuth 2.0 authentication
 * - Combined authentication guard
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [AuthModule],
 * })
 * export class AppModule {}
 *
 * // Using guards
 * @UseGuards(JwtAuthGuard)
 * @Controller('users')
 * export class UsersController {}
 * ```
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}), // Configuration provided via strategies
  ],
  controllers: [AuthController, ApiKeysController],
  providers: [
    AuthService,
    JwtStrategy,
    ApiKeyStrategy,
    GoogleStrategy,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    CombinedAuthGuard,
    GoogleAuthGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    ApiKeyAuthGuard,
    CombinedAuthGuard,
    GoogleAuthGuard,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
