import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublishService } from './publish.service';
import { PublishController } from './publish.controller';
import { WordpressService } from './wordpress.service';
import { MediumService } from './medium.service';
import { PublishLog } from '../database/entities/publish-log.entity';
import { Content } from '../database/entities/content.entity';
import { MediaConnection } from '../database/entities/media-connection.entity';
import { ContentModule } from '../content/content.module';
import { BacklinksModule } from '../backlinks/backlinks.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishLog, Content, MediaConnection]),
    forwardRef(() => ContentModule),
    BacklinksModule,
    MediaModule,
  ],
  controllers: [PublishController],
  providers: [PublishService, WordpressService, MediumService],
  exports: [PublishService],
})
export class PublishModule {}

