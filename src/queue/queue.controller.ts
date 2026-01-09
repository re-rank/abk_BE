import { Controller, Post, Body, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { QueueService } from './queue.service';

@ApiTags('Queue')
@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(private queueService: QueueService) {}

  // QStash webhook endpoint for publish jobs
  @Post('process-publish')
  @ApiOperation({ summary: 'Process publish job from QStash' })
  async processPublish(
    @Body()
    body: {
      contentId: string;
      platform: 'WORDPRESS' | 'MEDIUM';
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
}

