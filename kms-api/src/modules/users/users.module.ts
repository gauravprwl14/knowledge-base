import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

/**
 * UsersModule provides user profile functionality:
 * - GET /users/me — authenticated user profile
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [UsersModule],
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
