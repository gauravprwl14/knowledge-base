import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { UserRepository } from '../../database/repositories/user.repository';
import { ErrorFactory } from '../../errors/types/error-factory';
import { Trace } from '../../telemetry/decorators/trace.decorator';

/**
 * UsersService provides user profile operations.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class UsersController {
 *   constructor(private readonly usersService: UsersService) {}
 *
 *   @Get('me')
 *   getMe(@CurrentUser('id') userId: string) {
 *     return this.usersService.getProfile(userId);
 *   }
 * }
 * ```
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Returns the public profile for the given user.
   * @param userId - The authenticated user's ID
   * @returns User profile (without password hash)
   * @throws AppError (404) if the user is not found
   */
  @Trace({ name: 'users.getProfile' })
  async getProfile(userId: string): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    emailVerified: boolean;
    createdAt: Date;
  }> {
    const user = await this.userRepository.findUnique({ id: userId });

    if (!user) {
      throw ErrorFactory.notFound('User', userId);
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  }
}
