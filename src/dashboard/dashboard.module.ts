import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Content } from '../database/entities/content.entity';
import { Backlink } from '../database/entities/backlink.entity';
import { PublishLog } from '../database/entities/publish-log.entity';
import { SnsPost } from '../database/entities/sns-post.entity';
import { Project } from '../database/entities/project.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Backlink, PublishLog, SnsPost, Project]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}

