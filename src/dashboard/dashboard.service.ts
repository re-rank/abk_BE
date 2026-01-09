import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content, ContentStatus } from '../database/entities/content.entity';
import { Backlink, BacklinkSourceType } from '../database/entities/backlink.entity';
import { PublishLog, PublishPlatform, PublishStatus } from '../database/entities/publish-log.entity';
import { SnsPost } from '../database/entities/sns-post.entity';
import { Project } from '../database/entities/project.entity';

interface DashboardStats {
  contentStats: {
    total: number;
    created: number;
    published: number;
    failed: number;
  };
  backlinkStats: {
    total: number;
    byType: Record<string, number>;
    byPosition: Record<string, number>;
    anchorTextDistribution: { text: string; count: number }[];
  };
  publishStats: {
    total: number;
    byPlatform: Record<string, number>;
    successRate: number;
  };
  snsStats: {
    total: number;
    byPlatform: Record<string, number>;
  };
}

export { DashboardStats };

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Backlink)
    private backlinkRepository: Repository<Backlink>,
    @InjectRepository(PublishLog)
    private publishLogRepository: Repository<PublishLog>,
    @InjectRepository(SnsPost)
    private snsPostRepository: Repository<SnsPost>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  async getProjectStats(projectId: string, userId: string): Promise<DashboardStats> {
    // 프로젝트 권한 확인
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    const [contentStats, backlinkStats, publishStats, snsStats] = await Promise.all([
      this.getContentStats(projectId),
      this.getBacklinkStats(projectId),
      this.getPublishStats(projectId),
      this.getSnsStats(projectId),
    ]);

    return {
      contentStats,
      backlinkStats,
      publishStats,
      snsStats,
    };
  }

  private async getContentStats(projectId: string) {
    const contents = await this.contentRepository.find({
      where: { projectId },
    });

    const total = contents.length;
    const created = contents.filter(c => c.status === ContentStatus.CREATED).length;
    const published = contents.filter(c => c.status === ContentStatus.PUBLISHED).length;
    const failed = contents.filter(c => c.status === ContentStatus.FAILED).length;

    return { total, created, published, failed };
  }

  private async getBacklinkStats(projectId: string) {
    const backlinks = await this.backlinkRepository.find({
      where: { projectId },
    });

    const total = backlinks.length;
    const byType: Record<string, number> = {};
    const byPosition: Record<string, number> = {};
    const anchorTextCount: Record<string, number> = {};

    backlinks.forEach(backlink => {
      byType[backlink.sourceType] = (byType[backlink.sourceType] || 0) + 1;
      byPosition[backlink.insertedPosition] = (byPosition[backlink.insertedPosition] || 0) + 1;
      anchorTextCount[backlink.anchorText] = (anchorTextCount[backlink.anchorText] || 0) + 1;
    });

    const anchorTextDistribution = Object.entries(anchorTextCount)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { total, byType, byPosition, anchorTextDistribution };
  }

  private async getPublishStats(projectId: string) {
    const contents = await this.contentRepository.find({
      where: { projectId },
      select: ['id'],
    });

    const contentIds = contents.map(c => c.id);

    if (contentIds.length === 0) {
      return { total: 0, byPlatform: {}, successRate: 0 };
    }

    const publishLogs = await this.publishLogRepository
      .createQueryBuilder('log')
      .where('log.contentId IN (:...contentIds)', { contentIds })
      .getMany();

    const total = publishLogs.length;
    const byPlatform: Record<string, number> = {};
    let successCount = 0;

    publishLogs.forEach(log => {
      byPlatform[log.platform] = (byPlatform[log.platform] || 0) + 1;
      if (log.status === PublishStatus.SUCCESS) {
        successCount++;
      }
    });

    const successRate = total > 0 ? (successCount / total) * 100 : 0;

    return { total, byPlatform, successRate };
  }

  private async getSnsStats(projectId: string) {
    const contents = await this.contentRepository.find({
      where: { projectId },
      select: ['id'],
    });

    const contentIds = contents.map(c => c.id);

    if (contentIds.length === 0) {
      return { total: 0, byPlatform: {} };
    }

    const snsPosts = await this.snsPostRepository
      .createQueryBuilder('post')
      .where('post.contentId IN (:...contentIds)', { contentIds })
      .getMany();

    const total = snsPosts.length;
    const byPlatform: Record<string, number> = {};

    snsPosts.forEach(post => {
      byPlatform[post.platform] = (byPlatform[post.platform] || 0) + 1;
    });

    return { total, byPlatform };
  }

  async getOverallStats(userId: string) {
    const projects = await this.projectRepository.find({ where: { userId } });

    const projectIds = projects.map(p => p.id);

    const [totalContents, totalBacklinks, totalPublished] = await Promise.all([
      this.contentRepository.count({
        where: projectIds.map(id => ({ projectId: id })),
      }),
      this.backlinkRepository.count({
        where: projectIds.map(id => ({ projectId: id })),
      }),
      this.contentRepository.count({
        where: projectIds.map(id => ({ projectId: id, status: ContentStatus.PUBLISHED })),
      }),
    ]);

    return {
      totalProjects: projects.length,
      totalContents,
      totalBacklinks,
      totalPublished,
    };
  }
}

