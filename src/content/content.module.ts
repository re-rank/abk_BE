import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { AiService } from './ai.service';
import { Content } from '../database/entities/content.entity';
import { Project } from '../database/entities/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { BacklinksModule } from '../backlinks/backlinks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Content, Project]),
    ProjectsModule,
    BacklinksModule,
  ],
  controllers: [ContentController],
  providers: [ContentService, AiService],
  exports: [ContentService],
})
export class ContentModule {}

