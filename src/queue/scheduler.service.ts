import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Client } from '@upstash/qstash';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './queue.service';
import { Project } from '../database/entities/project.entity';
import { Content, ContentStatus } from '../database/entities/content.entity';
import { CrawlerService } from '../analytics/crawler.service';
import { NaverDataLabService } from '../analytics/naver-datalab.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { KeywordRanking } from '../database/entities/keyword-ranking.entity';
import { MediaConnection } from '../database/entities/media-connection.entity';

// 발행 가능한 모든 플랫폼
const PUBLISH_PLATFORMS = ['WORDPRESS', 'MEDIUM', 'NAVER_BLOG', 'TISTORY'] as const;
type PublishPlatformType = typeof PUBLISH_PLATFORMS[number];

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private qstashClient: Client;

  constructor(
    private queueService: QueueService,
    private configService: ConfigService,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(KeywordRanking)
    private keywordRankingRepository: Repository<KeywordRanking>,
    @InjectRepository(MediaConnection)
    private mediaConnectionRepository: Repository<MediaConnection>,
    private crawlerService: CrawlerService,
    private naverDataLabService: NaverDataLabService,
    private analyticsService: AnalyticsService,
  ) {
    // QStash 클라이언트 초기화
    const qstashToken = this.configService.get<string>('QSTASH_TOKEN');
    if (qstashToken) {
      this.qstashClient = new Client({ token: qstashToken });
      this.logger.log('QStash client initialized');
    } else {
      this.logger.warn('QStash token not found, using local scheduling only');
    }
  }

  // 매 시간마다 발행 예정 콘텐츠 확인 (프로젝트별 스케줄 적용)
  @Cron(CronExpression.EVERY_HOUR)
  async checkScheduledPublish() {
    this.logger.log('Checking scheduled publish for all projects...');
    
    const now = new Date();
    const currentDay = now.getDay(); // 0=일, 1=월, ..., 6=토
    const currentHour = now.getHours();

    // 자동 발행이 활성화된 프로젝트 조회
    const projects = await this.projectRepository.find({
      where: { autoPublishEnabled: true },
    });

    for (const project of projects) {
      try {
        await this.processProjectSchedule(project, currentDay, currentHour);
      } catch (error) {
        this.logger.error(`Failed to process schedule for project ${project.id}:`, error);
      }
    }
  }

  /**
   * 프로젝트의 발행 스케줄 처리
   */
  private async processProjectSchedule(
    project: Project,
    currentDay: number,
    currentHour: number,
  ) {
    // 발행 요일 확인
    let publishDays: number[] = [1, 3, 5]; // 기본값: 월, 수, 금
    
    if (project.publishDays) {
      const days: unknown = project.publishDays;
      
      // publishDays가 문자열인 경우
      if (typeof days === 'string') {
        publishDays = days.split(',').map(Number);
      } 
      // 배열인 경우 (이미 파싱된 경우)
      else if (Array.isArray(days)) {
        publishDays = days.map((d: any) => Number(d));
      }
      // 숫자인 경우 (단일 요일)
      else if (typeof days === 'number') {
        publishDays = [days];
      }
    }
    
    if (!publishDays.includes(currentDay)) {
      this.logger.debug(`Project ${project.projectName}: Not a publish day (current: ${currentDay}, configured: ${publishDays.join(',')})`);
      return; // 오늘은 발행일이 아님
    }

    // 발행 시간 확인
    const [publishHour] = (project.publishTime || '10:00').split(':').map(Number);
    if (currentHour !== publishHour) {
      this.logger.debug(`Project ${project.projectName}: Not publish hour (current: ${currentHour}, configured: ${publishHour})`);
      return; // 발행 시간이 아님
    }

    this.logger.log(`Project ${project.projectName}: Schedule check passed - processing...`);

    // 발행 대기 중인 콘텐츠 조회 (CREATED 상태)
    const pendingContents = await this.contentRepository.find({
      where: {
        projectId: project.id,
        status: ContentStatus.CREATED,
      },
      order: { createdAt: 'ASC' },
      take: 1, // 한 번에 하나씩 발행
    });

    if (pendingContents.length === 0) {
      this.logger.log(`Project ${project.projectName}: No pending content to publish`);
      return;
    }

    const content = pendingContents[0];

    // 프로젝트에 targetPlatforms가 설정되어 있지 않으면 연결된 매체에서 가져오기
    let targetPlatforms: string[] = [];
    
    if (project.targetPlatforms) {
      targetPlatforms = project.targetPlatforms.split(',').filter(p => PUBLISH_PLATFORMS.includes(p as any));
    }
    
    // targetPlatforms가 비어있으면 연결된 매체에서 발행 가능한 플랫폼 자동 선택
    if (targetPlatforms.length === 0 && project.userId) {
      const connectedMedia = await this.mediaConnectionRepository.find({
        where: { 
          projectId: project.id, 
          userId: project.userId,
        },
      });
      
      // 연결된 매체 중 발행 가능한 플랫폼만 선택
      targetPlatforms = connectedMedia
        .filter(m => PUBLISH_PLATFORMS.includes(m.platform as any))
        .map(m => m.platform);
      
      this.logger.log(`Project ${project.projectName}: Auto-selected platforms from connected media: ${targetPlatforms.join(', ')}`);
    }

    if (targetPlatforms.length === 0) {
      this.logger.warn(`Project ${project.projectName}: No publish platforms configured or connected`);
      return;
    }

    // 랜덤 지연 계산 (프로젝트 설정 기반)
    const maxDelayMinutes = project.randomDelayMinutes || 240;
    const randomDelayMs = Math.floor(Math.random() * maxDelayMinutes * 60 * 1000);
    const scheduledTime = new Date(Date.now() + randomDelayMs);

    this.logger.log(
      `Scheduling content "${content.title}" for project "${project.projectName}" at ${scheduledTime.toISOString()} on platforms: ${targetPlatforms.join(', ')}`,
    );

    // 각 플랫폼에 발행 스케줄링
    let scheduledCount = 0;
    for (const platform of targetPlatforms) {
      if (PUBLISH_PLATFORMS.includes(platform as any) && project.userId) {
        await this.schedulePublish(
          content.id,
          platform as PublishPlatformType,
          project.userId,
          scheduledTime,
        );
        scheduledCount++;
      }
    }

    if (scheduledCount > 0) {
      this.logger.log(`Project ${project.projectName}: Scheduled publish to ${scheduledCount} platform(s)`);
    }
  }

  // 랜덤 시간 분산을 위한 지연 계산 (0~4시간 사이 랜덤)
  calculateRandomDelay(): number {
    const maxDelayHours = 4;
    const randomHours = Math.random() * maxDelayHours;
    return Math.floor(randomHours * 60 * 60 * 1000); // 밀리초로 변환
  }

  // 발행 작업 스케줄링 (QStash 사용)
  async schedulePublish(
    contentId: string,
    platform: PublishPlatformType,
    userId: string,
    scheduledAt?: Date,
  ) {
    let delay = 0;
    let scheduleTime: Date | undefined;

    if (scheduledAt) {
      delay = scheduledAt.getTime() - Date.now();
      if (delay < 0) delay = 0;
      scheduleTime = scheduledAt;
    } else {
      // 랜덤 지연 적용
      delay = this.calculateRandomDelay();
      scheduleTime = new Date(Date.now() + delay);
    }

    // QStash를 사용한 스케줄링 (서버리스 환경에 최적)
    if (this.qstashClient) {
      try {
        const baseUrl = this.configService.get<string>('APP_URL');
        if (!baseUrl) {
          throw new Error('APP_URL 환경변수가 설정되지 않았습니다.');
        }
        const response = await this.qstashClient.publishJSON({
          url: `${baseUrl}/api/queue/process-publish`,
          body: { contentId, platform, userId },
          notBefore: Math.floor(scheduleTime.getTime() / 1000), // Unix timestamp (seconds)
        });
        
        this.logger.log(
          `Scheduled publish via QStash for content ${contentId} on ${platform} at ${scheduleTime.toISOString()}`,
        );
        return response;
      } catch (error) {
        this.logger.error('QStash scheduling failed, falling back to BullMQ', error);
      }
    }

    // Fallback: BullMQ를 사용한 로컬 스케줄링
    await this.queueService.addPublishJob(
      { contentId, platform, userId },
      delay,
    );

    this.logger.log(
      `Scheduled publish via BullMQ for content ${contentId} on ${platform} with delay ${delay}ms`,
    );
  }

  // SNS 공유 스케줄링 (발행 후 1시간 뒤, QStash 사용)
  async scheduleSnsShare(
    contentId: string,
    platform: 'TWITTER' | 'LINKEDIN',
    userId: string,
  ) {
    const delay = 60 * 60 * 1000; // 1시간
    const scheduleTime = new Date(Date.now() + delay);

    // QStash를 사용한 스케줄링
    if (this.qstashClient) {
      try {
        const baseUrl = this.configService.get<string>('APP_URL');
        if (!baseUrl) {
          throw new Error('APP_URL 환경변수가 설정되지 않았습니다.');
        }
        const response = await this.qstashClient.publishJSON({
          url: `${baseUrl}/api/queue/process-sns`,
          body: { contentId, platform, userId },
          notBefore: Math.floor(scheduleTime.getTime() / 1000),
        });
        
        this.logger.log(
          `Scheduled SNS share via QStash for content ${contentId} on ${platform}`,
        );
        return response;
      } catch (error) {
        this.logger.error('QStash SNS scheduling failed, falling back to BullMQ', error);
      }
    }

    // Fallback: BullMQ
    await this.queueService.addSnsJob(
      { contentId, platform, userId },
      delay,
    );

    this.logger.log(
      `Scheduled SNS share via BullMQ for content ${contentId} on ${platform}`,
    );
  }

  // 큐 상태 모니터링 (매 시간)
  @Cron(CronExpression.EVERY_HOUR)
  async monitorQueues() {
    const publishStats = await this.queueService.getPublishQueueStats();
    const snsStats = await this.queueService.getSnsQueueStats();

    this.logger.log(`Publish Queue: ${JSON.stringify(publishStats)}`);
    this.logger.log(`SNS Queue: ${JSON.stringify(snsStats)}`);
  }

  /**
   * 매일 오전 6시에 모든 프로젝트의 키워드 순위 업데이트
   */
  @Cron('0 6 * * *') // 매일 06:00
  async updateKeywordRankings() {
    this.logger.log('Starting daily keyword ranking update...');

    const projects = await this.projectRepository.find();
    
    for (const project of projects) {
      try {
        await this.crawlerService.updateProjectKeywordRankings(project.id);
        this.logger.log(`Keyword rankings updated for project: ${project.projectName}`);
      } catch (error) {
        this.logger.error(
          `Failed to update keyword rankings for project ${project.id}: ${error.message}`,
        );
      }

      // 프로젝트 간 딜레이 (크롤링 rate limit 방지)
      await this.delay(5000);
    }

    this.logger.log('Daily keyword ranking update completed');
  }

  /**
   * 매일 오전 7시에 모든 프로젝트의 매체 통계 업데이트
   */
  @Cron('0 7 * * *') // 매일 07:00
  async updateMediaStats() {
    this.logger.log('Starting daily media stats update...');

    const projects = await this.projectRepository.find();

    for (const project of projects) {
      try {
        if (!project.userId) {
          this.logger.warn(`Skipping project ${project.id}: no userId`);
          continue;
        }
        await this.crawlerService.updateProjectMediaStats(project.id, project.userId);
        this.logger.log(`Media stats updated for project: ${project.projectName}`);
      } catch (error) {
        this.logger.error(
          `Failed to update media stats for project ${project.id}: ${error.message}`,
        );
      }

      await this.delay(10000);
    }

    this.logger.log('Daily media stats update completed');
  }

  /**
   * 매주 월요일 오전 5시에 키워드 검색량 업데이트
   */
  @Cron('0 5 * * 1') // 매주 월요일 05:00
  async updateKeywordSearchVolume() {
    this.logger.log('Starting weekly keyword search volume update...');

    if (!this.naverDataLabService.isAvailable()) {
      this.logger.warn('Naver DataLab API not configured, skipping search volume update');
      return;
    }

    // 모든 활성 키워드 조회
    const keywords = await this.keywordRankingRepository.find({
      where: { isActive: true },
    });

    // 중복 제거된 키워드 목록
    const uniqueKeywords = [...new Set(keywords.map((k) => k.keyword))];

    // 5개씩 배치로 처리 (API 제한)
    for (let i = 0; i < uniqueKeywords.length; i += 5) {
      const batch = uniqueKeywords.slice(i, i + 5);
      
      try {
        const volumes = await Promise.all(
          batch.map((kw) => this.naverDataLabService.estimateMonthlySearchVolume(kw)),
        );

        // 검색량 업데이트
        for (let j = 0; j < batch.length; j++) {
          const keyword = batch[j];
          const volume = volumes[j];
          
          await this.keywordRankingRepository.update(
            { keyword, isActive: true },
            { monthlySearchVolume: volume },
          );
        }
      } catch (error) {
        this.logger.error(`Search volume update failed for batch: ${error.message}`);
      }

      // API rate limit 방지
      await this.delay(1000);
    }

    this.logger.log('Weekly keyword search volume update completed');
  }

  /**
   * 딜레이 유틸리티
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

