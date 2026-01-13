import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import { Content, ContentStatus } from '../database/entities/content.entity';
import { Project } from '../database/entities/project.entity';
import { PublishLog, PublishStatus, PublishPlatform } from '../database/entities/publish-log.entity';
import { Backlink } from '../database/entities/backlink.entity';
import { SnsPost } from '../database/entities/sns-post.entity';
import { AiService } from './ai.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { CreateContentDto } from './dto/create-content.dto';
import { ScheduleContentDto } from './dto/schedule-content.dto';

const PUBLISH_PLATFORMS = ['WORDPRESS', 'MEDIUM', 'NAVER_BLOG', 'TISTORY'] as const;

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(PublishLog)
    private publishLogRepository: Repository<PublishLog>,
    @InjectRepository(Backlink)
    private backlinkRepository: Repository<Backlink>,
    @InjectRepository(SnsPost)
    private snsPostRepository: Repository<SnsPost>,
    private aiService: AiService,
    private backlinksService: BacklinksService,
  ) {}

  async create(
    userId: string,
    createContentDto: CreateContentDto,
  ): Promise<Content> {
    const { projectId, title, body, contentType, searchCta } = createContentDto;

    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    const content = this.contentRepository.create({
      projectId,
      title,
      body,
      contentType,
      searchCta: searchCta || project.brandName + ' 검색해보세요!',
      status: ContentStatus.CREATED,
    });

    const savedContent = await this.contentRepository.save(content);
    await this.backlinksService.createSelfBacklink(savedContent, project);

    return savedContent;
  }

  async generate(
    userId: string,
    generateContentDto: GenerateContentDto,
  ): Promise<Content> {
    const { projectId, contentType, topic } = generateContentDto;

    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    const generated = await this.aiService.generateContent({
      brandName: project.brandName,
      mainKeyword: project.mainKeyword,
      contentType,
      topic,
      targetUrl: project.targetUrl,
    });

    const content = this.contentRepository.create({
      projectId,
      title: generated.title,
      body: generated.body,
      contentType,
      searchCta: generated.searchCta,
      status: ContentStatus.CREATED,
    });

    const savedContent = await this.contentRepository.save(content);
    await this.backlinksService.createSelfBacklink(savedContent, project);

    return savedContent;
  }

  async findAllByProject(projectId: string, userId: string): Promise<Content[]> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    return this.contentRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Content> {
    const content = await this.contentRepository.findOne({
      where: { id },
      relations: ['project', 'backlinks'],
    });

    if (!content) {
      throw new NotFoundException('콘텐츠를 찾을 수 없습니다.');
    }

    if (content.project.userId !== userId) {
      throw new ForbiddenException('이 콘텐츠에 접근할 권한이 없습니다.');
    }

    return content;
  }

  async update(
    id: string,
    userId: string,
    updateContentDto: UpdateContentDto,
  ): Promise<Content> {
    const content = await this.findOne(id, userId);
    Object.assign(content, updateContentDto);
    return this.contentRepository.save(content);
  }

  async remove(id: string, userId: string): Promise<void> {
    const content = await this.findOne(id, userId);

    // 연관 데이터 먼저 삭제 (외래키 제약 조건 해결)
    await this.backlinkRepository.delete({ contentId: id });
    await this.publishLogRepository.delete({ contentId: id });
    await this.snsPostRepository.delete({ contentId: id });

    // 콘텐츠 삭제
    await this.contentRepository.remove(content);
    this.logger.log(`Content deleted: ${id}`);
  }

  async updateStatus(id: string, status: ContentStatus): Promise<Content> {
    const content = await this.contentRepository.findOne({ where: { id } });
    if (!content) {
      throw new NotFoundException('콘텐츠를 찾을 수 없습니다.');
    }
    content.status = status;
    return this.contentRepository.save(content);
  }

  async findById(id: string): Promise<Content | null> {
    return this.contentRepository.findOne({
      where: { id },
      relations: ['project'],
    });
  }

  async schedulePublish(
    contentId: string,
    userId: string,
    scheduleDto: ScheduleContentDto,
  ): Promise<Content> {
    const content = await this.findOne(contentId, userId);
    const project = content.project;

    const scheduledAt = new Date(scheduleDto.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new ForbiddenException('예약 시간은 현재 시간 이후여야 합니다.');
    }

    let platforms = scheduleDto.platforms || [];
    if (platforms.length === 0 && project.targetPlatforms) {
      const targetPlatforms: unknown = project.targetPlatforms;
      if (typeof targetPlatforms === 'string') {
        platforms = targetPlatforms.split(',').filter(p => PUBLISH_PLATFORMS.includes(p as any));
      } else if (Array.isArray(targetPlatforms)) {
        platforms = targetPlatforms.filter(p => PUBLISH_PLATFORMS.includes(p as any));
      }
    }

    if (platforms.length === 0) {
      throw new ForbiddenException('발행할 플랫폼이 지정되지 않았습니다.');
    }

    content.status = ContentStatus.SCHEDULED;
    content.scheduledAt = scheduledAt;
    content.scheduledPlatforms = platforms.join(',');

    for (const platform of platforms) {
      const publishLog = this.publishLogRepository.create({
        contentId: content.id,
        platform: platform as PublishPlatform,
        status: PublishStatus.SCHEDULED,
        scheduledAt,
      });
      await this.publishLogRepository.save(publishLog);
    }

    this.logger.log('Content ' + content.id + ' scheduled for ' + scheduledAt.toISOString());

    return this.contentRepository.save(content);
  }

  async cancelSchedule(contentId: string, userId: string, reason?: string): Promise<Content> {
    const content = await this.findOne(contentId, userId);

    if (content.status !== ContentStatus.SCHEDULED) {
      throw new ForbiddenException('예약된 콘텐츠만 취소할 수 있습니다.');
    }

    content.status = ContentStatus.CREATED;
    content.scheduledAt = null as any;
    content.scheduledPlatforms = null as any;
    content.qstashMessageIds = null as any;

    await this.publishLogRepository.delete({
      contentId: content.id,
      status: PublishStatus.SCHEDULED,
    });

    this.logger.log('Content ' + content.id + ' schedule cancelled. Reason: ' + (reason || 'Not specified'));

    return this.contentRepository.save(content);
  }

  async getPublishStatus(contentId: string, userId: string): Promise<{
    content: Content;
    publishLogs: PublishLog[];
    summary: {
      total: number;
      scheduled: number;
      processing: number;
      success: number;
      failed: number;
    };
  }> {
    const content = await this.contentRepository.findOne({
      where: { id: contentId },
      relations: ['project', 'publishLogs'],
    });

    if (!content) {
      throw new NotFoundException('콘텐츠를 찾을 수 없습니다.');
    }

    if (content.project.userId !== userId) {
      throw new ForbiddenException('이 콘텐츠에 접근할 권한이 없습니다.');
    }

    const publishLogs = await this.publishLogRepository.find({
      where: { contentId },
      order: { createdAt: 'DESC' },
    });

    const summary = {
      total: publishLogs.length,
      scheduled: publishLogs.filter(l => l.status === PublishStatus.SCHEDULED).length,
      processing: publishLogs.filter(l => l.status === PublishStatus.PROCESSING).length,
      success: publishLogs.filter(l => l.status === PublishStatus.SUCCESS).length,
      failed: publishLogs.filter(l => l.status === PublishStatus.FAILED).length,
    };

    return { content, publishLogs, summary };
  }

  async findScheduledContents(userId: string): Promise<Content[]> {
    const projects = await this.projectRepository.find({
      where: { userId },
      select: ['id'],
    });

    const projectIds = projects.map(p => p.id);

    if (projectIds.length === 0) {
      return [];
    }

    return this.contentRepository.find({
      where: {
        projectId: In(projectIds),
        status: ContentStatus.SCHEDULED,
      },
      relations: ['project', 'publishLogs'],
      order: { scheduledAt: 'ASC' },
    });
  }

  async findDueContents(): Promise<Content[]> {
    return this.contentRepository.find({
      where: {
        status: ContentStatus.SCHEDULED,
        scheduledAt: LessThanOrEqual(new Date()),
      },
      relations: ['project'],
    });
  }
}
