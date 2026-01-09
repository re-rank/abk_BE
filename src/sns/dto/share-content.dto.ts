import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SnsPlatform } from '../../database/entities/sns-post.entity';

export class ShareContentDto {
  @ApiProperty({ description: '콘텐츠 ID' })
  @IsUUID()
  contentId: string;

  @ApiProperty({
    enum: SnsPlatform,
    description: 'SNS 플랫폼 (TWITTER, LINKEDIN)',
    example: 'TWITTER',
  })
  @IsEnum(SnsPlatform)
  platform: SnsPlatform;
}

