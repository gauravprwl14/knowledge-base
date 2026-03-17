import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserProfileResponseDto } from './dto/users.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiEndpoint } from '../../common/decorators/swagger.decorator';

/**
 * UsersController — exposes user profile endpoints.
 *
 * Routes:
 * - GET /api/v1/users/me — get the authenticated user's profile
 */
@ApiTags('Users')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Returns the authenticated user's profile.
   */
  @Get('me')
  @ApiEndpoint({
    summary: 'Get current user profile',
    description: 'Returns the profile of the currently authenticated user',
    responseType: UserProfileResponseDto,
    successStatus: HttpStatus.OK,
    responses: [
      { status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' },
      { status: HttpStatus.NOT_FOUND, description: 'User not found' },
    ],
  })
  async getMe(
    @CurrentUser('id') userId: string,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.getProfile(userId);
  }
}
