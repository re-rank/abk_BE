import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentType } from '../../database/entities/content.entity';

export class CreateContentDto {
  @ApiProperty({ description: '프로젝트 ID' })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ description: '콘텐츠 제목' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: '콘텐츠 본문 (HTML 또는 Markdown)' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({
    description: '콘텐츠 유형',
    enum: ContentType,
    example: ContentType.INFO,
  })
  @IsEnum(ContentType)
  @IsNotEmpty()
  contentType: ContentType;

  @ApiPropertyOptional({ description: '검색 유도 CTA 문구' })
  @IsString()
  @IsOptional()
  searchCta?: string;
}

