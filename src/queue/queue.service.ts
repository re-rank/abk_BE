import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

export interface PublishJobData {
  contentId: string;
  platform: 'WORDPRESS' | 'MEDIUM' | 'NAVER_BLOG' | 'TISTORY';
  userId: string;
}

export interface SnsJobData {
  contentId: string;
  platform: 'TWITTER' | 'LINKEDIN';
  userId: string;
}

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('publish') private publishQueue: Queue,
    @InjectQueue('sns') private snsQueue: Queue,
  ) {}

  async addPublishJob(data: PublishJobData, delay?: number) {
    return this.publishQueue.add('publish-content', data, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1분부터 시작
      },
    });
  }

  async addSnsJob(data: SnsJobData, delay?: number) {
    return this.snsQueue.add('share-content', data, {
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30000, // 30초부터 시작
      },
    });
  }

  async getPublishQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.publishQueue.getWaitingCount(),
      this.publishQueue.getActiveCount(),
      this.publishQueue.getCompletedCount(),
      this.publishQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  async getSnsQueueStats() {
    const [waiting, active, completed, failed] = await Promise.all([
      this.snsQueue.getWaitingCount(),
      this.snsQueue.getActiveCount(),
      this.snsQueue.getCompletedCount(),
      this.snsQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}

