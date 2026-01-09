import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateContentDto {
  @ApiProperty({ description: '제목', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: '본문', required: false })
  @IsOptional()
  @IsString()
  body?: string;
}

