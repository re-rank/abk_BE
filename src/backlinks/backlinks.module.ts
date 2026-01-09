import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BacklinksService } from './backlinks.service';
import { BacklinksController } from './backlinks.controller';
import { Backlink } from '../database/entities/backlink.entity';
import { AuthoritySite } from '../database/entities/authority-site.entity';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Backlink, AuthoritySite]),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [BacklinksController],
  providers: [BacklinksService],
  exports: [BacklinksService],
})
export class BacklinksModule {}

