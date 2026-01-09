import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { PublishProcessor } from './processors/publish.processor';
import { SchedulerService } from './scheduler.service';
import { PublishModule } from '../publish/publish.module';
import { SnsModule } from '../sns/sns.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { Project } from '../database/entities/project.entity';
import { Content } from '../database/entities/content.entity';
import { KeywordRanking } from '../database/entities/keyword-ranking.entity';
import { MediaConnection } from '../database/entities/media-connection.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Content, KeywordRanking, MediaConnection]),
    BullModule.registerQueue(
      { name: 'publish' },
      { name: 'sns' },
      { name: 'scheduler' },
    ),
    forwardRef(() => PublishModule),
    forwardRef(() => SnsModule),
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [QueueController],
  providers: [QueueService, PublishProcessor, SchedulerService],
  exports: [QueueService, SchedulerService],
})
export class QueueModule {}

