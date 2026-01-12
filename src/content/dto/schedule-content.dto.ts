import { IsString, IsOptional, IsDateString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ScheduleContentDto {
  @ApiProperty({ description: '예약 발행 시간 (ISO 8601 형식)', example: '2026-01-15T10:00:00Z' })
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({
    description: '발행 대상 플랫폼 (비어있으면 프로젝트 기본값 사용)',
    example: ['NAVER_BLOG', 'TISTORY'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];
}

export class CancelScheduleDto {
  @ApiProperty({ description: '취소 사유', required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
