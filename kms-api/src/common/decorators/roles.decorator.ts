import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Roles decorator for role-based access control
 *
 * @example
 * ```typescript
 * @Roles(UserRole.ADMIN)
 * @Get('admin')
 * adminOnly() {}
 *
 * @Roles(UserRole.ADMIN, UserRole.USER)
 * @Get('users-and-admins')
 * usersAndAdmins() {}
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
