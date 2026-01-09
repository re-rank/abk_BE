import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnsService } from './sns.service';
import { SnsController } from './sns.controller';
import { TwitterService } from './twitter.service';
import { LinkedinService } from './linkedin.service';
import { SnsPost } from '../database/entities/sns-post.entity';
import { MediaConnection } from '../database/entities/media-connection.entity';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SnsPost, MediaConnection]),
    forwardRef(() => ContentModule),
  ],
  controllers: [SnsController],
  providers: [SnsService, TwitterService, LinkedinService],
  exports: [SnsService],
})
export class SnsModule {}

