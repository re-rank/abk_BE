import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediaPlatform } from '../../database/entities/media-connection.entity';

export class CreateMediaConnectionDto {
  @ApiProperty({ description: '프로젝트 ID' })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    description: '매체 플랫폼',
    enum: MediaPlatform,
    example: MediaPlatform.WORDPRESS,
  })
  @IsEnum(MediaPlatform)
  @IsNotEmpty()
  platform: MediaPlatform;

  // WordPress 연동
  @ApiPropertyOptional({ description: 'WordPress API URL' })
  @IsUrl()
  @IsOptional()
  apiUrl?: string;

  @ApiPropertyOptional({ description: '사용자명' })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({ description: '앱 비밀번호 또는 비밀번호' })
  @IsString()
  @IsOptional()
  password?: string;

  // OAuth 기반 연동 (X, LinkedIn)
  @ApiPropertyOptional({ description: 'Client ID (LinkedIn, X OAuth)' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Client Secret (LinkedIn, X OAuth)' })
  @IsString()
  @IsOptional()
  clientSecret?: string;

  @ApiPropertyOptional({ description: 'API Key (레거시 호환)' })
  @IsString()
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'API Secret (레거시 호환)' })
  @IsString()
  @IsOptional()
  apiSecret?: string;

  @ApiPropertyOptional({ description: 'Access Token (OAuth 발급 후)' })
  @IsString()
  @IsOptional()
  accessToken?: string;

  @ApiPropertyOptional({ description: 'Refresh Token (OAuth 발급 후)' })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'Access Token Secret (X/Twitter)' })
  @IsString()
  @IsOptional()
  accessTokenSecret?: string;
}

