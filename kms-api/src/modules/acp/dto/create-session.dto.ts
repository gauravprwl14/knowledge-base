import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateSessionDto {
  @ApiPropertyOptional({
    description: 'Working directory hint from the client',
    example: '/Users/dev/my-project',
  })
  @IsOptional()
  @IsString()
  cwd?: string;
}
