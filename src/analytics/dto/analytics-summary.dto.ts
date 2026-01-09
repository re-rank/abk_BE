import { MediaPlatform } from '../../database/entities/media-connection.entity';

export class SeoMetricsDto {
  domainAuthority: number;
  pageAuthority: number;
  totalBacklinks: number;
  indexedPages: number;
  spamScore: number;
}

export class ContentPerformanceDto {
  totalPosts: number;
  totalViews: number;
  avgViews: number;
  engagementRate: number;
  topPosts: {
    title: string;
    url: string;
    views: number;
    publishedAt: string;
  }[];
}

export class TrafficSourcesDto {
  organic: number;
  direct: number;
  social: number;
  referral: number;
}

export class TrafficDataDto {
  daily: { date: string; visitors: number; pageViews: number }[];
  weekly: { week: string; visitors: number; pageViews: number }[];
  monthly: { month: string; visitors: number; pageViews: number }[];
  avgSessionDuration: number;
  bounceRate: number;
  trafficSources: TrafficSourcesDto;
}

export class PlatformAnalyticsDto {
  platform: MediaPlatform;
  seoMetrics: SeoMetricsDto;
  contentPerformance: ContentPerformanceDto;
  trafficSources: TrafficSourcesDto;
  lastDataCollectedAt: string | null;
}

export class AnalyticsSummaryDto {
  projectId: string;
  platforms: PlatformAnalyticsDto[];
  overallStats: {
    totalPosts: number;
    totalViews: number;
    avgDomainAuthority: number;
    totalBacklinks: number;
  };
  lastUpdatedAt: string | null;
}

export class NaverAuthDto {
  siteUrl: string;
  accessToken: string;
}

export class GoogleAuthDto {
  propertyId: string;
  credentials: string; // JSON 형태의 서비스 계정 키
}

export class GoogleAnalyticsConnectionDto {
  propertyId: string;
  credentials: string; // 서비스 계정 JSON 문자열
}

export class GoogleAnalyticsStatusDto {
  connected: boolean;
  propertyId: string | null;
  lastCheckedAt: string | null;
  error: string | null;
}

// 통합 분석 DTO
export class MediaStatsDto {
  platform: MediaPlatform;
  platformName: string;
  accountUrl: string | null;
  totalPosts: number;
  totalViews: number;
  todayVisitors: number;
  avgViews: number;
  engagementRate: number;
  lastUpdated: string | null;
}

export class UnifiedAnalyticsDto {
  projectId: string;
  targetUrl: string;
  
  // 각 매체별 통계
  mediaStats: MediaStatsDto[];
  
  // 통합 통계
  totalStats: {
    totalPosts: number;
    totalViews: number;
    totalTodayVisitors: number;
    mediaCount: number;
  };
  
  // 타겟 URL 유입 분석 (GA 연동 시)
  targetUrlAnalysis: {
    connected: boolean;
    totalVisitors: number;
    sources: {
      source: string;
      medium: string;
      visitors: number;
      percentage: number;
    }[];
    mediaBreakdown: {
      platform: string;
      visitors: number;
      percentage: number;
    }[];
  } | null;
  
  lastUpdatedAt: string | null;
}

