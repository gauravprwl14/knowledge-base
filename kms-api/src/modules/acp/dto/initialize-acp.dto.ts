import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ClientInfoDto {
  @ApiProperty({ example: 'claude-code' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  version!: string;
}

export class InitializeAcpDto {
  @ApiProperty({ description: 'ACP protocol version', example: 1 })
  @IsNumber()
  protocolVersion!: number;

  @ApiPropertyOptional({ type: ClientInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClientInfoDto)
  clientInfo?: ClientInfoDto;
}
