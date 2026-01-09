import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { PlaywrightAuthService } from './playwright-auth.service';
import { MediaConnection } from '../database/entities/media-connection.entity';
import { Project } from '../database/entities/project.entity';
import { AuthModule } from '../auth/auth.module';
import { LinkedinService } from '../sns/linkedin.service';

@Module({
  imports: [TypeOrmModule.forFeature([MediaConnection, Project]), AuthModule],
  controllers: [MediaController],
  providers: [MediaService, PlaywrightAuthService, LinkedinService],
  exports: [MediaService, PlaywrightAuthService],
})
export class MediaModule {}

