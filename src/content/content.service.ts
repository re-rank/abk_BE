import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content, ContentStatus } from '../database/entities/content.entity';
import { Project } from '../database/entities/project.entity';
import { AiService } from './ai.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { GenerateContentDto } from './dto/generate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { CreateContentDto } from './dto/create-content.dto';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private aiService: AiService,
    private backlinksService: BacklinksService,
  ) {}

  /**
   * 콘텐츠 직접 생성 (사용자가 직접 작성한 콘텐츠 업로드)
   */
  async create(
    userId: string,
    createContentDto: CreateContentDto,
  ): Promise<Content> {
    const { projectId, title, body, contentType, searchCta } = createContentDto;

    // 프로젝트 조회 및 권한 확인
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    // 콘텐츠 저장
    const content = this.contentRepository.create({
      projectId,
      title,
      body,
      contentType,
      searchCta: searchCta || `${project.brandName} 검색해보세요!`,
      status: ContentStatus.CREATED,
    });

    const savedContent = await this.contentRepository.save(content);

    // SELF 백링크 자동 생성
    await this.backlinksService.createSelfBacklink(savedContent, project);

    return savedContent;
  }

  /**
   * AI를 통한 콘텐츠 자동 생성
   */
  async generate(
    userId: string,
    generateContentDto: GenerateContentDto,
  ): Promise<Content> {
    const { projectId, contentType, topic } = generateContentDto;

    // 프로젝트 조회 및 권한 확인
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    // AI를 통한 콘텐츠 생성 (백링크 포함)
    const generated = await this.aiService.generateContent({
      brandName: project.brandName,
      mainKeyword: project.mainKeyword,
      contentType,
      topic,
      targetUrl: project.targetUrl, // 백링크 삽입을 위한 타겟 URL
    });

    // 콘텐츠 저장
    const content = this.contentRepository.create({
      projectId,
      title: generated.title,
      body: generated.body,
      contentType,
      searchCta: generated.searchCta,
      status: ContentStatus.CREATED,
    });

    const savedContent = await this.contentRepository.save(content);

    // SELF 백링크 자동 생성
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
    await this.contentRepository.remove(content);
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
}

