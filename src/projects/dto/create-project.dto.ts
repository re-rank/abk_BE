import { IsString, IsUrl, IsOptional, IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'SEO 프로젝트 1', description: '프로젝트 이름' })
  @IsString()
  projectName: string;

  @ApiProperty({ example: '홍길동 변호사', description: '브랜드 이름' })
  @IsString()
  brandName: string;

  @ApiProperty({ example: '강남 변호사', description: '메인 키워드' })
  @IsString()
  mainKeyword: string;

  @ApiProperty({ example: 'https://example.com', description: '타겟 URL' })
  @IsUrl({}, { message: '유효한 URL을 입력해주세요.' })
  targetUrl: string;

  @ApiProperty({ example: '변호사 사무실 SEO 프로젝트', description: '설명', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'WordPress API URL', required: false })
  @IsOptional()
  @IsUrl()
  wordpressUrl?: string;

  @ApiProperty({ description: 'WordPress 사용자명', required: false })
  @IsOptional()
  @IsString()
  wordpressUsername?: string;

  @ApiProperty({ description: 'WordPress 앱 비밀번호', required: false })
  @IsOptional()
  @IsString()
  wordpressAppPassword?: string;

  @ApiProperty({ description: 'Medium 액세스 토큰', required: false })
  @IsOptional()
  @IsString()
  mediumAccessToken?: string;

  // 자동 발행 스케줄 설정
  @ApiProperty({ description: '자동 발행 활성화 여부', required: false, default: true })
  @IsOptional()
  @IsBoolean()
  autoPublishEnabled?: boolean;

  @ApiProperty({ description: '발행 요일 (0=일, 1=월, ... 6=토), 콤마로 구분', example: '1,3,5', required: false })
  @IsOptional()
  @IsString()
  publishDays?: string;

  @ApiProperty({ description: '발행 시간 (24시간 형식)', example: '10:00', required: false })
  @IsOptional()
  @IsString()
  publishTime?: string;

  @ApiProperty({ description: '랜덤 지연 최대 시간 (분)', example: 240, required: false })
  @IsOptional()
  @IsNumber()
  randomDelayMinutes?: number;

  @ApiProperty({ description: '타겟 플랫폼 목록 (콤마로 구분)', example: 'WORDPRESS,NAVER_BLOG', required: false })
  @IsOptional()
  @IsString()
  targetPlatforms?: string;
}

