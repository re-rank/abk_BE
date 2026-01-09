import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PublishPlatform } from '../../database/entities/publish-log.entity';

export class PublishContentDto {
  @ApiProperty({ description: '콘텐츠 ID' })
  @IsUUID()
  contentId: string;

  @ApiProperty({
    enum: PublishPlatform,
    description: '발행 플랫폼 (WORDPRESS, MEDIUM)',
    example: 'WORDPRESS',
  })
  @IsEnum(PublishPlatform)
  platform: PublishPlatform;
}

