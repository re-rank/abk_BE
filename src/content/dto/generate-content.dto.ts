import { IsString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ContentType } from '../../database/entities/content.entity';

export class GenerateContentDto {
  @ApiProperty({ description: '프로젝트 ID' })
  @IsUUID()
  projectId: string;

  @ApiProperty({
    enum: ContentType,
    description: '콘텐츠 유형 (INFO, CASE, GUIDE)',
    example: 'INFO',
  })
  @IsEnum(ContentType)
  contentType: ContentType;

  @ApiProperty({
    description: '콘텐츠 주제 (선택사항)',
    required: false,
    example: '변호사 선임 시 주의사항',
  })
  @IsOptional()
  @IsString()
  topic?: string;
}

