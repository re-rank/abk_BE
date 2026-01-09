import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { PublishService } from '../../publish/publish.service';
import { PublishJobData, SnsJobData } from '../queue.service';
import { PublishPlatform } from '../../database/entities/publish-log.entity';
import { SnsPlatform } from '../../database/entities/sns-post.entity';
import { SnsService } from '../../sns/sns.service';

@Processor('publish')
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name);

  constructor(
    @Inject(forwardRef(() => PublishService))
    private publishService: PublishService,
  ) {
    super();
  }

  async process(job: Job<PublishJobData>) {
    this.logger.log(`Processing publish job ${job.id}`);

    try {
      const { contentId, platform, userId } = job.data;

      await this.publishService.publish(userId, {
        contentId,
        platform: platform as PublishPlatform,
      });

      this.logger.log(`Publish job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Publish job ${job.id} failed: ${error}`);
      throw error;
    }
  }
}

@Processor('sns')
export class SnsProcessor extends WorkerHost {
  private readonly logger = new Logger(SnsProcessor.name);

  constructor(
    @Inject(forwardRef(() => SnsService))
    private snsService: SnsService,
  ) {
    super();
  }

  async process(job: Job<SnsJobData>) {
    this.logger.log(`Processing SNS job ${job.id}`);

    try {
      const { contentId, platform, userId } = job.data;

      await this.snsService.share(userId, {
        contentId,
        platform: platform as SnsPlatform,
      });

      this.logger.log(`SNS job ${job.id} completed successfully`);
    } catch (error) {
      this.logger.error(`SNS job ${job.id} failed: ${error}`);
      throw error;
    }
  }
}

