import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacklinksService } from './backlinks.service';
import { BacklinksController } from './backlinks.controller';
import { BacklinkSitesService } from './backlink-sites.service';
import { BacklinkSitesController } from './backlink-sites.controller';
import { Backlink } from '../database/entities/backlink.entity';
import { AuthoritySite } from '../database/entities/authority-site.entity';
import { BacklinkPost } from '../database/entities/backlink-post.entity';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Backlink, AuthoritySite, BacklinkPost]),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [BacklinksController, BacklinkSitesController],
  providers: [BacklinksService, BacklinkSitesService],
  exports: [BacklinksService],
})
export class BacklinksModule {}
