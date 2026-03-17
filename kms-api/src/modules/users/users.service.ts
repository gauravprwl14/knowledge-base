import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { UserRepository } from '../../database/repositories/user.repository';
import { ErrorFactory } from '../../errors/types/error-factory';

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
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly userRepository: UserRepository) {}

  /**
   * Returns the public profile for the given user.
   * @param userId - The authenticated user's ID
   * @returns User profile (without password hash)
   * @throws AppError (404) if the user is not found
   */
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
