import { IsString, IsOptional, IsEnum, IsBoolean, IsUrl } from 'class-validator';
import { SearchEngine } from '../../database/entities/keyword-ranking.entity';
import { MediaPlatform } from '../../database/entities/media-connection.entity';

export class CreateKeywordDto {
  @IsString()
  keyword: string;

  @IsEnum(SearchEngine)
  @IsOptional()
  searchEngine?: SearchEngine = SearchEngine.NAVER;

  @IsEnum(MediaPlatform)
  @IsOptional()
  platform?: MediaPlatform;

  @IsUrl()
  @IsOptional()
  targetUrl?: string;
}

export class UpdateKeywordDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUrl()
  @IsOptional()
  targetUrl?: string;
}

export class KeywordRankingResponseDto {
  id: string;
  keyword: string;
  searchEngine: SearchEngine;
  platform?: MediaPlatform;
  targetUrl?: string;
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number;
  bestRank: number | null;
  monthlySearchVolume: number;
  competitionLevel: number;
  rankHistory: { date: string; rank: number | null }[];
  isActive: boolean;
  lastCheckedAt: string | null;
}

