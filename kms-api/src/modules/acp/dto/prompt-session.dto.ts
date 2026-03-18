import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PromptPartDto {
  @ApiProperty({ enum: ['text'], example: 'text' })
  @IsEnum(['text'])
  type!: 'text';

  @ApiProperty({ example: 'What embedding model does this project use?' })
  @IsString()
  text!: string;
}

export class PromptSessionDto {
  @ApiProperty({ type: [PromptPartDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromptPartDto)
  prompt!: PromptPartDto[];
}
