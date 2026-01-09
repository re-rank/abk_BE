import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Backlink,
  BacklinkSourceType,
  BacklinkPlatform,
  BacklinkPosition,
} from '../database/entities/backlink.entity';
import { AuthoritySite } from '../database/entities/authority-site.entity';
import { Content } from '../database/entities/content.entity';
import { Project } from '../database/entities/project.entity';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class BacklinksService {
  // 앵커 텍스트 유형들
  private readonly anchorTextTypes = [
    'BRAND', // 브랜드명만
    'KEYWORD_BRAND', // 키워드 + 브랜드명
    'GENERIC', // 일반 정보성 문구
  ];

  // 일반 정보성 앵커 텍스트 목록
  private readonly genericAnchors = [
    '자세히 보기',
    '더 알아보기',
    '관련 정보',
    '상세 내용 확인',
    '여기를 클릭',
  ];

  constructor(
    @InjectRepository(Backlink)
    private backlinkRepository: Repository<Backlink>,
    @InjectRepository(AuthoritySite)
    private authoritySiteRepository: Repository<AuthoritySite>,
    private projectsService: ProjectsService,
  ) {}

  async createSelfBacklink(content: Content, project: Project): Promise<Backlink> {
    const anchorText = this.generateAnchorText(project.brandName, project.mainKeyword);
    const position = this.randomPosition();

    const backlink = this.backlinkRepository.create({
      contentId: content.id,
      projectId: project.id,
      sourceType: BacklinkSourceType.SELF,
      sourcePlatform: BacklinkPlatform.WORDPRESS,
      targetUrl: project.targetUrl,
      anchorText,
      isFollow: true,
      insertedPosition: position,
      isApproved: true,
    });

    return this.backlinkRepository.save(backlink);
  }

  async createInternalBacklink(
    sourceContent: Content,
    targetContent: Content,
    project: Project,
  ): Promise<Backlink> {
    const anchorText = targetContent.title.substring(0, 30);
    const position = this.randomPosition();

    const backlink = this.backlinkRepository.create({
      contentId: sourceContent.id,
      projectId: project.id,
      sourceType: BacklinkSourceType.INTERNAL,
      sourcePlatform: BacklinkPlatform.WORDPRESS,
      targetUrl: project.targetUrl,
      anchorText,
      isFollow: true,
      insertedPosition: position,
      isApproved: true,
    });

    return this.backlinkRepository.save(backlink);
  }

  async findAllByProject(projectId: string, userId: string): Promise<Backlink[]> {
    const project = await this.projectsService.findOneById(projectId);
    
    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    return this.backlinkRepository.find({
      where: { projectId },
      relations: ['content'],
      order: { createdAt: 'DESC' },
    });
  }

  async getBacklinkStats(projectId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byPosition: Record<string, number>;
    anchorTextDistribution: Record<string, number>;
  }> {
    const backlinks = await this.backlinkRepository.find({
      where: { projectId },
    });

    const byType: Record<string, number> = {};
    const byPosition: Record<string, number> = {};
    const anchorTextDistribution: Record<string, number> = {};

    backlinks.forEach((backlink) => {
      // 유형별 집계
      byType[backlink.sourceType] = (byType[backlink.sourceType] || 0) + 1;
      
      // 위치별 집계
      byPosition[backlink.insertedPosition] = (byPosition[backlink.insertedPosition] || 0) + 1;
      
      // 앵커 텍스트 분산도
      anchorTextDistribution[backlink.anchorText] = (anchorTextDistribution[backlink.anchorText] || 0) + 1;
    });

    return {
      total: backlinks.length,
      byType,
      byPosition,
      anchorTextDistribution,
    };
  }

  // Authority Site 관리 (Admin용)
  async createAuthoritySite(data: Partial<AuthoritySite>): Promise<AuthoritySite> {
    const site = this.authoritySiteRepository.create(data);
    return this.authoritySiteRepository.save(site);
  }

  async getAllAuthoritySites(): Promise<AuthoritySite[]> {
    return this.authoritySiteRepository.find({
      where: { isActive: true },
      order: { priority: 'DESC' },
    });
  }

  private generateAnchorText(brandName: string, mainKeyword: string): string {
    const type = this.anchorTextTypes[Math.floor(Math.random() * this.anchorTextTypes.length)];

    switch (type) {
      case 'BRAND':
        return brandName;
      case 'KEYWORD_BRAND':
        return `${mainKeyword} ${brandName}`;
      case 'GENERIC':
        return this.genericAnchors[Math.floor(Math.random() * this.genericAnchors.length)];
      default:
        return brandName;
    }
  }

  private randomPosition(): BacklinkPosition {
    return Math.random() > 0.5 ? BacklinkPosition.MID : BacklinkPosition.BOTTOM;
  }

  insertBacklinkIntoContent(
    body: string,
    backlink: Backlink,
  ): string {
    const paragraphs = body.split('\n\n');
    
    if (paragraphs.length < 2) {
      // 문단이 적으면 마지막에 추가
      return `${body}\n\n<a href="${backlink.targetUrl}">${backlink.anchorText}</a>`;
    }

    const link = `<a href="${backlink.targetUrl}"${backlink.isFollow ? '' : ' rel="nofollow"'}>${backlink.anchorText}</a>`;

    if (backlink.insertedPosition === BacklinkPosition.MID) {
      // 중간에 삽입 (첫 문단 제외)
      const midIndex = Math.max(1, Math.floor(paragraphs.length / 2));
      paragraphs[midIndex] = `${paragraphs[midIndex]} ${link}`;
    } else {
      // 마지막 문단에 삽입
      paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${link}`;
    }

    return paragraphs.join('\n\n');
  }
}

