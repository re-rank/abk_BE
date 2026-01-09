import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { CrawlerService } from './crawler.service';
import { CreateKeywordDto, UpdateKeywordDto } from './dto/keyword-ranking.dto';
import { MediaPlatform } from '../database/entities/media-connection.entity';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  name?: string;
}

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly crawlerService: CrawlerService,
  ) {}

  /**
   * 프로젝트 분석 요약 조회
   */
  @Get(':projectId/summary')
  async getSummary(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.getSummary(projectId, user.userId);
  }

  /**
   * 키워드 순위 목록 조회
   */
  @Get(':projectId/keywords')
  async getKeywords(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.getKeywords(projectId, user.userId);
  }

  /**
   * 타겟 키워드 추가
   */
  @Post(':projectId/keywords')
  async addKeyword(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateKeywordDto,
  ) {
    return this.analyticsService.addKeyword(projectId, user.userId, dto);
  }

  /**
   * 키워드 수정
   */
  @Patch(':projectId/keywords/:keywordId')
  async updateKeyword(
    @Param('projectId') projectId: string,
    @Param('keywordId') keywordId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateKeywordDto,
  ) {
    return this.analyticsService.updateKeyword(
      projectId,
      keywordId,
      user.userId,
      dto,
    );
  }

  /**
   * 키워드 삭제
   */
  @Delete(':projectId/keywords/:keywordId')
  async deleteKeyword(
    @Param('projectId') projectId: string,
    @Param('keywordId') keywordId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.analyticsService.deleteKeyword(projectId, keywordId, user.userId);
    return { success: true };
  }

  /**
   * 트래픽 데이터 조회
   */
  @Get(':projectId/traffic')
  async getTrafficData(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('platform') platform?: MediaPlatform,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getTrafficData(
      projectId,
      user.userId,
      platform,
      days ? parseInt(days, 10) : 30,
    );
  }

  /**
   * 수동 데이터 수집 트리거
   */
  /**
   * 매체 통계 데이터 수집 트리거 (수동 수집)
   */
  @Post(':projectId/collect')
  async triggerCollection(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body('platform') platform?: MediaPlatform,
  ) {
    try {
      // 프로젝트의 모든 매체 통계 수집
      await this.crawlerService.updateProjectMediaStats(projectId, user.userId);
      
      // 키워드 순위도 함께 업데이트
      await this.crawlerService.updateProjectKeywordRankings(projectId);
      
      return {
        success: true,
        message: '데이터 수집이 완료되었습니다.',
        projectId,
        platform,
      };
    } catch (error) {
      return {
        success: false,
        message: '데이터 수집 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 매체 분석 초기화
   */
  @Post(':projectId/initialize/:platform')
  async initializeAnalytics(
    @Param('projectId') projectId: string,
    @Param('platform') platform: MediaPlatform,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.initializeAnalytics(projectId, user.userId, platform);
  }

  /**
   * Google Analytics 연동
   */
  @Post(':projectId/google-analytics/connect')
  async connectGoogleAnalytics(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: { propertyId: string; credentials: string },
  ) {
    return this.analyticsService.connectGoogleAnalytics(
      projectId,
      user.userId,
      dto.propertyId,
      dto.credentials,
    );
  }

  /**
   * Google Analytics 연동 해제
   */
  @Delete(':projectId/google-analytics')
  async disconnectGoogleAnalytics(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.analyticsService.disconnectGoogleAnalytics(projectId, user.userId);
    return { success: true };
  }

  /**
   * Google Analytics 연동 상태 조회
   */
  @Get(':projectId/google-analytics/status')
  async getGoogleAnalyticsStatus(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.analyticsService.getGoogleAnalyticsStatus(projectId, user.userId);
  }

  /**
   * 타겟 URL로 유입된 트래픽 소스별 분석
   */
  @Get(':projectId/referrer-analysis')
  async getTrafficByReferrer(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getTrafficByReferrer(
      projectId,
      user.userId,
      days ? parseInt(days, 10) : 30,
    );
  }

  /**
   * 통합 분석 데이터 조회 (모든 매체 + 타겟 URL)
   */
  @Get(':projectId/unified')
  async getUnifiedAnalytics(
    @Param('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getUnifiedAnalytics(
      projectId,
      user.userId,
      days ? parseInt(days, 10) : 30,
    );
  }
}
