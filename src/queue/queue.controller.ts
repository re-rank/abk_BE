import { Controller, Post, Body, Logger, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { QueueService, PublishJobData, SnsJobData } from './queue.service';
import { SchedulerService } from './scheduler.service';

@ApiTags('Queue')
@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    private queueService: QueueService,
    private schedulerService: SchedulerService,
  ) {}

  // QStash webhook endpoint for publish jobs
  @Post('process-publish')
  @ApiOperation({ summary: 'Process publish job from QStash' })
  async processPublish(
    @Body()
    body: {
      contentId: string;
      platform: 'WORDPRESS' | 'MEDIUM' | 'NAVER_BLOG' | 'TISTORY';
      userId: string;
    },
  ) {
    this.logger.log(
      `Processing publish job for content ${body.contentId} on ${body.platform}`,
    );

    try {
      await this.queueService.addPublishJob(
        {
          contentId: body.contentId,
          platform: body.platform,
          userId: body.userId,
        },
        0, // Immediate processing
      );

      return {
        success: true,
        message: 'Publish job queued successfully',
      };
    } catch (error) {
      this.logger.error('Failed to queue publish job', error);
      throw error;
    }
  }

  // QStash webhook endpoint for SNS jobs
  @Post('process-sns')
  @ApiOperation({ summary: 'Process SNS share job from QStash' })
  async processSns(
    @Body()
    body: {
      contentId: string;
      platform: 'TWITTER' | 'LINKEDIN';
      userId: string;
    },
  ) {
    this.logger.log(
      `Processing SNS share job for content ${body.contentId} on ${body.platform}`,
    );

    try {
      await this.queueService.addSnsJob(
        {
          contentId: body.contentId,
          platform: body.platform,
          userId: body.userId,
        },
        0, // Immediate processing
      );

      return {
        success: true,
        message: 'SNS share job queued successfully',
      };
    } catch (error) {
      this.logger.error('Failed to queue SNS job', error);
      throw error;
    }
  }

  // Test endpoint to manually trigger scheduled publish check
  @Get('test-scheduler')
  @ApiOperation({ summary: 'Manually trigger scheduled publish check (for testing)' })
  async testScheduler() {
    this.logger.log('Manually triggering scheduled publish check...');

    try {
      await this.schedulerService.checkScheduledPublish();
      return {
        success: true,
        message: 'Scheduled publish check completed',
      };
    } catch (error) {
      this.logger.error('Failed to run scheduled publish check', error);
      throw error;
    }
  }
}
