import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { AiService } from './ai.service';
import { Content } from '../database/entities/content.entity';
import { Project } from '../database/entities/project.entity';
import { PublishLog } from '../database/entities/publish-log.entity';
import { Backlink } from '../database/entities/backlink.entity';
import { SnsPost } from '../database/entities/sns-post.entity';
import { ProjectsModule } from '../projects/projects.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Project, PublishLog, Backlink, SnsPost]),
    ProjectsModule,
    BacklinksModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, AiService],
  exports: [ContentService],
})
export class ContentModule {}

