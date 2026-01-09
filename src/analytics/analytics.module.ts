import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CrawlerService } from './crawler.service';
import { NaverSearchAdvisorService } from './naver-searchadvisor.service';
import { NaverDataLabService } from './naver-datalab.service';
import { GoogleAnalyticsService } from './google-analytics.service';
import { MediaAnalytics } from '../database/entities/media-analytics.entity';
import { KeywordRanking } from '../database/entities/keyword-ranking.entity';
import { TrafficSnapshot } from '../database/entities/traffic-snapshot.entity';
import { Project } from '../database/entities/project.entity';
import { MediaConnection } from '../database/entities/media-connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MediaAnalytics,
      KeywordRanking,
      TrafficSnapshot,
      Project,
      MediaConnection,
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    CrawlerService,
    NaverSearchAdvisorService,
    NaverDataLabService,
    GoogleAnalyticsService,
  ],
  exports: [
    AnalyticsService,
    CrawlerService,
    NaverSearchAdvisorService,
    NaverDataLabService,
    GoogleAnalyticsService,
  ],
})
export class AnalyticsModule {}

