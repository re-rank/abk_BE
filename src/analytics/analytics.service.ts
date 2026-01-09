import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MediaAnalytics } from '../database/entities/media-analytics.entity';
import {
  KeywordRanking,
  SearchEngine,
} from '../database/entities/keyword-ranking.entity';
import { TrafficSnapshot } from '../database/entities/traffic-snapshot.entity';
import { Project } from '../database/entities/project.entity';
import { MediaPlatform } from '../database/entities/media-connection.entity';
import {
  CreateKeywordDto,
  UpdateKeywordDto,
  KeywordRankingResponseDto,
} from './dto/keyword-ranking.dto';
import {
  AnalyticsSummaryDto,
  PlatformAnalyticsDto,
  TrafficDataDto,
  UnifiedAnalyticsDto,
  MediaStatsDto,
} from './dto/analytics-summary.dto';
import { GoogleAnalyticsService } from './google-analytics.service';
import { MediaConnection } from '../database/entities/media-connection.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(MediaAnalytics)
    private mediaAnalyticsRepository: Repository<MediaAnalytics>,
    @InjectRepository(KeywordRanking)
    private keywordRankingRepository: Repository<KeywordRanking>,
    @InjectRepository(TrafficSnapshot)
    private trafficSnapshotRepository: Repository<TrafficSnapshot>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(MediaConnection)
    private mediaConnectionRepository: Repository<MediaConnection>,
    private googleAnalyticsService: GoogleAnalyticsService,
  ) {}

  /**
   * 프로젝트 소유권 검증
   */
  private async verifyProjectOwnership(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    return project;
  }

  /**
   * 프로젝트 분석 요약 조회
   */
  async getSummary(projectId: string, userId: string): Promise<AnalyticsSummaryDto> {
    await this.verifyProjectOwnership(projectId, userId);

    const analytics = await this.mediaAnalyticsRepository.find({
      where: { projectId, userId },
    });

    const platforms: PlatformAnalyticsDto[] = analytics.map((a) => ({
      platform: a.platform,
      seoMetrics: {
        domainAuthority: a.domainAuthority,
        pageAuthority: a.pageAuthority,
        totalBacklinks: a.totalBacklinks,
        indexedPages: a.indexedPages,
        spamScore: a.spamScore,
      },
      contentPerformance: {
        totalPosts: a.totalPosts,
        totalViews: a.totalViews,
        avgViews: a.avgViews,
        engagementRate: a.engagementRate,
        topPosts: a.topPosts || [],
      },
      trafficSources: a.trafficSources || {
        organic: 0,
        direct: 0,
        social: 0,
        referral: 0,
      },
      lastDataCollectedAt: a.lastDataCollectedAt?.toISOString() || null,
    }));

    const overallStats = {
      totalPosts: analytics.reduce((sum, a) => sum + a.totalPosts, 0),
      totalViews: analytics.reduce((sum, a) => sum + a.totalViews, 0),
      avgDomainAuthority:
        analytics.length > 0
          ? analytics.reduce((sum, a) => sum + a.domainAuthority, 0) /
            analytics.length
          : 0,
      totalBacklinks: analytics.reduce((sum, a) => sum + a.totalBacklinks, 0),
    };

    const latestUpdate = analytics
      .filter((a) => a.lastDataCollectedAt)
      .sort(
        (a, b) =>
          b.lastDataCollectedAt!.getTime() - a.lastDataCollectedAt!.getTime(),
      )[0];

    return {
      projectId,
      platforms,
      overallStats,
      lastUpdatedAt: latestUpdate?.lastDataCollectedAt?.toISOString() || null,
    };
  }

  /**
   * 키워드 순위 목록 조회
   */
  async getKeywords(
    projectId: string,
    userId: string,
  ): Promise<KeywordRankingResponseDto[]> {
    await this.verifyProjectOwnership(projectId, userId);

    const keywords = await this.keywordRankingRepository.find({
      where: { projectId, userId },
      order: { createdAt: 'DESC' },
    });

    return keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      searchEngine: k.searchEngine,
      platform: k.platform,
      targetUrl: k.targetUrl,
      currentRank: k.currentRank,
      previousRank: k.previousRank,
      rankChange: k.rankChange,
      bestRank: k.bestRank,
      monthlySearchVolume: k.monthlySearchVolume,
      competitionLevel: k.competitionLevel,
      rankHistory: k.rankHistory || [],
      isActive: k.isActive,
      lastCheckedAt: k.lastCheckedAt?.toISOString() || null,
    }));
  }

  /**
   * 타겟 키워드 추가
   */
  async addKeyword(
    projectId: string,
    userId: string,
    dto: CreateKeywordDto,
  ): Promise<KeywordRanking> {
    await this.verifyProjectOwnership(projectId, userId);

    const keyword = this.keywordRankingRepository.create({
      projectId,
      userId,
      keyword: dto.keyword,
      searchEngine: dto.searchEngine || SearchEngine.NAVER,
      platform: dto.platform,
      targetUrl: dto.targetUrl,
      isActive: true,
      rankHistory: [],
    });

    return this.keywordRankingRepository.save(keyword);
  }

  /**
   * 키워드 수정
   */
  async updateKeyword(
    projectId: string,
    keywordId: string,
    userId: string,
    dto: UpdateKeywordDto,
  ): Promise<KeywordRanking> {
    await this.verifyProjectOwnership(projectId, userId);

    const keyword = await this.keywordRankingRepository.findOne({
      where: { id: keywordId, projectId, userId },
    });

    if (!keyword) {
      throw new NotFoundException('키워드를 찾을 수 없습니다.');
    }

    if (dto.isActive !== undefined) {
      keyword.isActive = dto.isActive;
    }
    if (dto.targetUrl !== undefined) {
      keyword.targetUrl = dto.targetUrl;
    }

    return this.keywordRankingRepository.save(keyword);
  }

  /**
   * 키워드 삭제
   */
  async deleteKeyword(
    projectId: string,
    keywordId: string,
    userId: string,
  ): Promise<void> {
    await this.verifyProjectOwnership(projectId, userId);

    const keyword = await this.keywordRankingRepository.findOne({
      where: { id: keywordId, projectId, userId },
    });

    if (!keyword) {
      throw new NotFoundException('키워드를 찾을 수 없습니다.');
    }

    await this.keywordRankingRepository.remove(keyword);
  }

  /**
   * 트래픽 데이터 조회
   */
  async getTrafficData(
    projectId: string,
    userId: string,
    platform?: MediaPlatform,
    days: number = 30,
  ): Promise<TrafficDataDto> {
    await this.verifyProjectOwnership(projectId, userId);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const whereCondition: {
      projectId: string;
      userId: string;
      date: ReturnType<typeof Between<Date>>;
      platform?: MediaPlatform;
    } = {
      projectId,
      userId,
      date: Between<Date>(startDate, endDate),
    };

    if (platform) {
      whereCondition.platform = platform;
    }

    const snapshots = await this.trafficSnapshotRepository.find({
      where: whereCondition,
      order: { date: 'ASC' },
    });

    // 일별 데이터
    const daily = snapshots.map((s) => ({
      date: s.date instanceof Date 
        ? s.date.toISOString().split('T')[0]
        : new Date(s.date).toISOString().split('T')[0],
      visitors: s.visitors,
      pageViews: s.pageViews,
    }));

    // 주별 집계
    const weeklyMap = new Map<
      string,
      { visitors: number; pageViews: number }
    >();
    snapshots.forEach((s) => {
      const weekStart = this.getWeekStart(new Date(s.date));
      const key = weekStart.toISOString().split('T')[0];
      const existing = weeklyMap.get(key) || { visitors: 0, pageViews: 0 };
      weeklyMap.set(key, {
        visitors: existing.visitors + s.visitors,
        pageViews: existing.pageViews + s.pageViews,
      });
    });
    const weekly = Array.from(weeklyMap.entries()).map(([week, data]) => ({
      week,
      ...data,
    }));

    // 월별 집계
    const monthlyMap = new Map<
      string,
      { visitors: number; pageViews: number }
    >();
    snapshots.forEach((s) => {
      const dateObj = s.date instanceof Date ? s.date : new Date(s.date);
      const key = dateObj.toISOString().slice(0, 7); // YYYY-MM
      const existing = monthlyMap.get(key) || { visitors: 0, pageViews: 0 };
      monthlyMap.set(key, {
        visitors: existing.visitors + s.visitors,
        pageViews: existing.pageViews + s.pageViews,
      });
    });
    const monthly = Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month,
      ...data,
    }));

    // 전체 평균
    const totalSnapshots = snapshots.length || 1;
    const avgSessionDuration =
      snapshots.reduce((sum, s) => sum + s.avgSessionDuration, 0) /
      totalSnapshots;
    const bounceRate =
      snapshots.reduce((sum, s) => sum + s.bounceRate, 0) / totalSnapshots;

    const trafficSources = {
      organic: snapshots.reduce((sum, s) => sum + s.organicVisitors, 0),
      direct: snapshots.reduce((sum, s) => sum + s.directVisitors, 0),
      social: snapshots.reduce((sum, s) => sum + s.socialVisitors, 0),
      referral: snapshots.reduce((sum, s) => sum + s.referralVisitors, 0),
    };

    return {
      daily,
      weekly,
      monthly,
      avgSessionDuration,
      bounceRate,
      trafficSources,
    };
  }

  /**
   * 매체 분석 데이터 초기화/생성
   */
  async initializeAnalytics(
    projectId: string,
    userId: string,
    platform: MediaPlatform,
  ): Promise<MediaAnalytics> {
    await this.verifyProjectOwnership(projectId, userId);

    let analytics = await this.mediaAnalyticsRepository.findOne({
      where: { projectId, platform, userId },
    });

    if (!analytics) {
      analytics = this.mediaAnalyticsRepository.create({
        projectId,
        userId,
        platform,
        domainAuthority: 0,
        pageAuthority: 0,
        totalBacklinks: 0,
        indexedPages: 0,
        spamScore: 0,
        totalPosts: 0,
        totalViews: 0,
        avgViews: 0,
        engagementRate: 0,
      });
      await this.mediaAnalyticsRepository.save(analytics);
    }

    return analytics;
  }

  /**
   * 키워드 순위 업데이트
   */
  async updateKeywordRank(
    keywordId: string,
    rank: number | null,
  ): Promise<void> {
    const keyword = await this.keywordRankingRepository.findOne({
      where: { id: keywordId },
    });

    if (!keyword) return;

    const today = new Date().toISOString().split('T')[0];
    const history = keyword.rankHistory || [];

    // 오늘 이미 기록이 있으면 업데이트, 없으면 추가
    const todayIndex = history.findIndex((h) => h.date === today);
    if (todayIndex >= 0) {
      history[todayIndex].rank = rank;
    } else {
      history.push({ date: today, rank });
      // 최근 30일만 유지
      if (history.length > 30) {
        history.shift();
      }
    }

    keyword.previousRank = keyword.currentRank ?? null;
    keyword.currentRank = rank ?? null;
    keyword.rankChange =
      keyword.previousRank && rank
        ? keyword.previousRank - rank
        : 0;

    // 최고 순위 갱신
    if (rank && (!keyword.bestRank || rank < keyword.bestRank)) {
      keyword.bestRank = rank;
      keyword.bestRankAt = new Date();
    }

    keyword.rankHistory = history;
    keyword.lastCheckedAt = new Date();

    await this.keywordRankingRepository.save(keyword);
  }

  /**
   * 트래픽 스냅샷 저장
   */
  async saveTrafficSnapshot(
    projectId: string,
    userId: string,
    platform: MediaPlatform,
    data: Partial<TrafficSnapshot>,
  ): Promise<TrafficSnapshot> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let snapshot = await this.trafficSnapshotRepository.findOne({
      where: { projectId, platform, date: today },
    });

    if (snapshot) {
      Object.assign(snapshot, data);
    } else {
      snapshot = this.trafficSnapshotRepository.create({
        projectId,
        userId,
        platform,
        date: today,
        ...data,
      });
    }

    return this.trafficSnapshotRepository.save(snapshot);
  }

  /**
   * 주의 시작일 계산
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  }

  /**
   * Google Analytics 연동 설정 (프로젝트의 타겟 URL 분석용)
   */
  async connectGoogleAnalytics(
    projectId: string,
    userId: string,
    propertyId: string,
    credentials: string,
  ): Promise<{ success: boolean; message: string }> {
    const project = await this.verifyProjectOwnership(projectId, userId);

    // JSON 유효성 검증
    try {
      const parsed = JSON.parse(credentials);
      if (!parsed.client_email || !parsed.private_key) {
        return {
          success: false,
          message: '유효하지 않은 서비스 계정 JSON입니다. client_email과 private_key가 필요합니다.',
        };
      }
    } catch {
      return {
        success: false,
        message: 'JSON 형식이 올바르지 않습니다.',
      };
    }

    // 프로젝트에 GA 정보 저장 (타겟 URL과 연결)
    project.googleAnalyticsPropertyId = propertyId;
    project.googleAnalyticsCredentials = credentials;
    project.googleAnalyticsConnected = true;

    await this.projectRepository.save(project);

    return {
      success: true,
      message: `Google Analytics가 타겟 URL(${project.targetUrl})과 연동되었습니다.`,
    };
  }

  /**
   * Google Analytics 연동 해제
   */
  async disconnectGoogleAnalytics(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.verifyProjectOwnership(projectId, userId);

    project.googleAnalyticsPropertyId = null as any;
    project.googleAnalyticsCredentials = null as any;
    project.googleAnalyticsConnected = false;

    await this.projectRepository.save(project);
  }

  /**
   * Google Analytics 연동 상태 조회
   */
  async getGoogleAnalyticsStatus(
    projectId: string,
    userId: string,
  ): Promise<{
    connected: boolean;
    propertyId: string | null;
    targetUrl: string;
  }> {
    const project = await this.verifyProjectOwnership(projectId, userId);

    return {
      connected: project.googleAnalyticsConnected ?? false,
      propertyId: project.googleAnalyticsPropertyId ?? null,
      targetUrl: project.targetUrl,
    };
  }

  /**
   * 프로젝트의 GA 인증 정보 가져오기 (내부 사용)
   */
  async getGoogleAnalyticsCredentials(
    projectId: string,
  ): Promise<{ propertyId: string; credentials: string; targetUrl: string } | null> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project?.googleAnalyticsConnected || !project.googleAnalyticsCredentials) {
      return null;
    }

    return {
      propertyId: project.googleAnalyticsPropertyId!,
      credentials: project.googleAnalyticsCredentials,
      targetUrl: project.targetUrl,
    };
  }

  /**
   * 타겟 URL로 유입된 트래픽 소스별 분석 (referrer 기반)
   */
  async getTrafficByReferrer(
    projectId: string,
    userId: string,
    days: number = 30,
  ): Promise<{
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
  }> {
    const project = await this.verifyProjectOwnership(projectId, userId);

    if (!project.googleAnalyticsConnected || !project.googleAnalyticsCredentials) {
      return {
        totalVisitors: 0,
        sources: [],
        mediaBreakdown: [],
      };
    }

    // GA에서 트래픽 소스 데이터 가져오기
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const trafficSources = await this.googleAnalyticsService.getTrafficSources(
      project.googleAnalyticsPropertyId!,
      project.googleAnalyticsCredentials,
      startDate,
      endDate,
    );

    if (!trafficSources.length) {
      return {
        totalVisitors: 0,
        sources: [],
        mediaBreakdown: [],
      };
    }

    // 총 방문자 계산
    const totalVisitors = trafficSources.reduce((sum, s) => sum + s.users, 0);

    // 소스별 데이터 가공
    const sources = trafficSources.map((s) => ({
      source: s.source,
      medium: s.medium,
      visitors: s.users,
      percentage: totalVisitors > 0 ? (s.users / totalVisitors) * 100 : 0,
    }));

    // 소유 매체별 분류 (referrer URL 기반)
    const mediaBreakdown = this.categorizeByOwnedMedia(trafficSources, totalVisitors);

    return {
      totalVisitors,
      sources,
      mediaBreakdown,
    };
  }

  /**
   * 트래픽 소스를 소유 매체 기준으로 분류
   */
  private categorizeByOwnedMedia(
    sources: { source: string; medium: string; users: number }[],
    totalVisitors: number,
  ): { platform: string; visitors: number; percentage: number }[] {
    const platformMap: Record<string, number> = {};

    // 매체 패턴 정의
    const platformPatterns: { pattern: RegExp; platform: string }[] = [
      { pattern: /blog\.naver\.com/i, platform: 'NAVER_BLOG' },
      { pattern: /tistory\.com/i, platform: 'TISTORY' },
      { pattern: /medium\.com/i, platform: 'MEDIUM' },
      { pattern: /wordpress/i, platform: 'WORDPRESS' },
      { pattern: /linkedin\.com/i, platform: 'LINKEDIN' },
      { pattern: /facebook\.com|fb\.com/i, platform: 'FACEBOOK' },
      { pattern: /twitter\.com|t\.co|x\.com/i, platform: 'X' },
      { pattern: /instagram\.com/i, platform: 'INSTAGRAM' },
      { pattern: /google/i, platform: 'GOOGLE_SEARCH' },
      { pattern: /naver(?!.*blog)/i, platform: 'NAVER_SEARCH' },
      { pattern: /daum/i, platform: 'DAUM_SEARCH' },
      { pattern: /\(direct\)/i, platform: 'DIRECT' },
    ];

    for (const source of sources) {
      let matched = false;
      for (const { pattern, platform } of platformPatterns) {
        if (pattern.test(source.source)) {
          platformMap[platform] = (platformMap[platform] || 0) + source.users;
          matched = true;
          break;
        }
      }
      if (!matched) {
        platformMap['OTHER'] = (platformMap['OTHER'] || 0) + source.users;
      }
    }

    // 배열로 변환하고 정렬
    return Object.entries(platformMap)
      .map(([platform, visitors]) => ({
        platform,
        visitors,
        percentage: totalVisitors > 0 ? (visitors / totalVisitors) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);
  }

  /**
   * 통합 분석 데이터 조회 (모든 매체 + 타겟 URL)
   */
  async getUnifiedAnalytics(
    projectId: string,
    userId: string,
    days: number = 30,
  ): Promise<UnifiedAnalyticsDto> {
    const project = await this.verifyProjectOwnership(projectId, userId);

    // 1. 연결된 모든 매체 가져오기
    const connections = await this.mediaConnectionRepository.find({
      where: { projectId, userId },
    });

    // 2. 각 매체별 분석 데이터 가져오기
    const mediaAnalytics = await this.mediaAnalyticsRepository.find({
      where: { projectId, userId },
    });

    // 3. 최근 트래픽 스냅샷 가져오기 (오늘 방문자 수)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySnapshots = await this.trafficSnapshotRepository.find({
      where: {
        projectId,
        userId,
        date: today,
      },
    });

    // 4. 매체별 통계 구성
    const mediaStats: MediaStatsDto[] = [];
    
    for (const connection of connections) {
      const analytics = mediaAnalytics.find(a => a.platform === connection.platform);
      const snapshot = todaySnapshots.find(s => s.platform === connection.platform);
      
      mediaStats.push({
        platform: connection.platform,
        platformName: this.getPlatformName(connection.platform),
        accountUrl: connection.accountUrl ?? null,
        totalPosts: analytics?.totalPosts || 0,
        totalViews: analytics?.totalViews || 0,
        todayVisitors: snapshot?.visitors || 0,
        avgViews: analytics?.avgViews || 0,
        engagementRate: analytics?.engagementRate || 0,
        lastUpdated: analytics?.lastDataCollectedAt?.toISOString() || null,
      });
    }

    // 5. 통합 통계 계산
    const totalStats = {
      totalPosts: mediaStats.reduce((sum, m) => sum + m.totalPosts, 0),
      totalViews: mediaStats.reduce((sum, m) => sum + m.totalViews, 0),
      totalTodayVisitors: mediaStats.reduce((sum, m) => sum + m.todayVisitors, 0),
      mediaCount: connections.length,
    };

    // 6. 타겟 URL GA 분석 (연동된 경우)
    let targetUrlAnalysis = null;
    if (project.googleAnalyticsConnected && project.googleAnalyticsCredentials) {
      const referrerData = await this.getTrafficByReferrer(projectId, userId, days);
      targetUrlAnalysis = {
        connected: true,
        ...referrerData,
      };
    }

    // 7. 최신 업데이트 시간 계산
    const updateTimes = mediaStats
      .map(m => m.lastUpdated)
      .filter(Boolean)
      .map(d => new Date(d!).getTime());
    
    const lastUpdatedAt = updateTimes.length > 0
      ? new Date(Math.max(...updateTimes)).toISOString()
      : null;

    return {
      projectId,
      targetUrl: project.targetUrl,
      mediaStats,
      totalStats,
      targetUrlAnalysis,
      lastUpdatedAt,
    };
  }

  /**
   * 플랫폼 한글명 변환
   */
  private getPlatformName(platform: MediaPlatform): string {
    const names: Record<string, string> = {
      WORDPRESS: 'WordPress',
      X: 'X (Twitter)',
      LINKEDIN: 'LinkedIn',
      NAVER_BLOG: '네이버 블로그',
      TISTORY: '티스토리',
      MEDIUM: 'Medium',
      FACEBOOK: 'Facebook',
      INSTAGRAM: 'Instagram',
    };
    return names[platform] || platform;
  }
}

