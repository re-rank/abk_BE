import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PublishLog, PublishPlatform, PublishStatus } from '../database/entities/publish-log.entity';
import { Content, ContentStatus } from '../database/entities/content.entity';
import { MediaConnection, MediaPlatform, ConnectionStatus } from '../database/entities/media-connection.entity';
import { WordpressService } from './wordpress.service';
import { MediumService } from './medium.service';
import { PlaywrightAuthService } from '../media/playwright-auth.service';
import { ContentService } from '../content/content.service';
import { BacklinksService } from '../backlinks/backlinks.service';
import { PublishContentDto } from './dto/publish-content.dto';

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    @InjectRepository(PublishLog)
    private publishLogRepository: Repository<PublishLog>,
    @InjectRepository(Content)
    private contentRepository: Repository<Content>,
    @InjectRepository(MediaConnection)
    private mediaConnectionRepository: Repository<MediaConnection>,
    @Inject(forwardRef(() => ContentService))
    private contentService: ContentService,
    private wordpressService: WordpressService,
    private mediumService: MediumService,
    private playwrightAuthService: PlaywrightAuthService,
    private backlinksService: BacklinksService,
  ) {}

  async publish(userId: string, publishDto: PublishContentDto): Promise<PublishLog> {
    const { contentId, platform } = publishDto;

    // 콘텐츠 조회
    const content = await this.contentService.findById(contentId);
    
    if (!content) {
      throw new NotFoundException('콘텐츠를 찾을 수 없습니다.');
    }

    if (content.project.userId !== userId) {
      throw new ForbiddenException('이 콘텐츠에 접근할 권한이 없습니다.');
    }

    // 백링크가 있으면 콘텐츠에 삽입
    const backlinks = await this.backlinksService.findAllByProject(
      content.projectId,
      userId,
    );
    
    let publishBody = content.body;
    const contentBacklinks = backlinks.filter(b => b.contentId === contentId);
    
    if (contentBacklinks.length > 0) {
      publishBody = this.backlinksService.insertBacklinkIntoContent(
        publishBody,
        contentBacklinks[0],
      );
    }

    // 발행 로그 생성
    const publishLog = this.publishLogRepository.create({
      contentId,
      platform: platform as PublishPlatform,
      status: PublishStatus.PENDING,
    });

    await this.publishLogRepository.save(publishLog);

    // 플랫폼별 발행 - 해당 프로젝트의 매체 연동에서 설정 가져오기
    // 보안: 반드시 projectId + userId로 조회하여 다른 프로젝트의 연동 정보 사용 방지
    let result;
    
    if (platform === PublishPlatform.WORDPRESS) {
      // 해당 프로젝트의 WordPress 매체 연동 조회
      const wordpressConnection = await this.mediaConnectionRepository.findOne({
        where: {
          projectId: content.projectId, // 프로젝트별 연동
          userId, // 사용자 검증
          platform: MediaPlatform.WORDPRESS,
          status: ConnectionStatus.CONNECTED,
        },
      });
      
      if (!wordpressConnection || !wordpressConnection.apiUrl || !wordpressConnection.username || !wordpressConnection.password) {
        publishLog.status = PublishStatus.FAILED;
        publishLog.errorMessage = '이 프로젝트의 WordPress 연동이 완료되지 않았습니다. 프로젝트 설정에서 매체를 연동해주세요.';
        await this.publishLogRepository.save(publishLog);
        return publishLog;
      }

      result = await this.wordpressService.publish(
        {
          apiUrl: wordpressConnection.apiUrl,
          username: wordpressConnection.username,
          appPassword: wordpressConnection.password,
        },
        content.title,
        publishBody,
      );
    } else if (platform === PublishPlatform.MEDIUM) {
      // Medium은 현재 지원되지 않음
      publishLog.status = PublishStatus.FAILED;
      publishLog.errorMessage = 'Medium 발행은 현재 지원되지 않습니다.';
      await this.publishLogRepository.save(publishLog);
      return publishLog;
    } else if (platform === PublishPlatform.NAVER_BLOG) {
      // 해당 프로젝트의 네이버 블로그 매체 연동 조회
      const naverConnection = await this.mediaConnectionRepository.findOne({
        where: {
          projectId: content.projectId,
          userId,
          platform: MediaPlatform.NAVER_BLOG,
          status: ConnectionStatus.CONNECTED,
        },
      });

      if (!naverConnection || !naverConnection.accessToken) {
        publishLog.status = PublishStatus.FAILED;
        publishLog.errorMessage = '이 프로젝트의 네이버 블로그 연동이 완료되지 않았습니다. 프로젝트 설정에서 매체를 연동해주세요.';
        await this.publishLogRepository.save(publishLog);
        return publishLog;
      }

      this.logger.log(`네이버 블로그 발행 시작: ${content.title}`);
      
      // credentials 전달 (세션 만료 시 자동 재로그인용)
      const credentials = naverConnection.username && naverConnection.password
        ? { username: naverConnection.username, password: naverConnection.password }
        : undefined;
      
      result = await this.playwrightAuthService.publishToNaverBlog(
        naverConnection.accessToken,
        content.title,
        publishBody,
        credentials,
      );

      // 발행 결과에 따라 콘텐츠 필드 업데이트
      if (result?.success) {
        content.naverBlogPostId = result.postId || '';
        
        // 새 쿠키가 반환되었으면 DB에 저장 (세션 갱신/재로그인 후)
        if (result.newCookies) {
          this.logger.log('새 세션 쿠키 저장 중...');
          naverConnection.accessToken = result.newCookies;
          await this.mediaConnectionRepository.save(naverConnection);
        }
      }
    } else if (platform === PublishPlatform.TISTORY) {
      // 해당 프로젝트의 티스토리 매체 연동 조회
      const tistoryConnection = await this.mediaConnectionRepository.findOne({
        where: {
          projectId: content.projectId,
          userId,
          platform: MediaPlatform.TISTORY,
          status: ConnectionStatus.CONNECTED,
        },
      });

      if (!tistoryConnection || !tistoryConnection.accessToken || !tistoryConnection.username || !tistoryConnection.password) {
        publishLog.status = PublishStatus.FAILED;
        publishLog.errorMessage = '이 프로젝트의 티스토리 연동이 완료되지 않았습니다. 프로젝트 설정에서 매체를 연동해주세요.';
        await this.publishLogRepository.save(publishLog);
        return publishLog;
      }

      // 블로그 URL 확인 (accountUrl 또는 apiUrl 사용, www.tistory.com은 무효)
      let blogUrl = tistoryConnection.accountUrl || tistoryConnection.apiUrl || '';

      // www.tistory.com은 메인 페이지이므로 무효한 URL
      if (blogUrl.includes('www.tistory.com')) {
        blogUrl = '';
      }

      if (!blogUrl) {
        publishLog.status = PublishStatus.FAILED;
        publishLog.errorMessage = '티스토리 블로그 URL이 필요합니다. 매체 연동에서 "연동 테스트" 버튼을 클릭하면 블로그 URL이 자동으로 추출됩니다.';
        await this.publishLogRepository.save(publishLog);
        return publishLog;
      }

      this.logger.log(`티스토리 발행 시작: ${content.title}, 블로그: ${blogUrl}`);
      result = await this.playwrightAuthService.publishToTistory(
        tistoryConnection.accessToken,
        blogUrl,
        tistoryConnection.username,
        tistoryConnection.password,
        content.title,
        publishBody,
      );

      // 발행 결과에 따라 콘텐츠 필드 업데이트
      if (result?.success) {
        content.tistoryPostId = result.postId || '';
        
        // 새 쿠키가 반환되었으면 DB에 저장 (세션 갱신 후)
        if (result.newCookies) {
          this.logger.log('티스토리 새 세션 쿠키 저장 중...');
          tistoryConnection.accessToken = result.newCookies;
          await this.mediaConnectionRepository.save(tistoryConnection);
        }
      }
    }

    // 결과 업데이트
    if (result?.success) {
      publishLog.status = PublishStatus.SUCCESS;
      publishLog.externalPostId = result.postId || '';
      publishLog.publishedUrl = result.postUrl || '';

      // 콘텐츠 상태 업데이트
      await this.contentService.updateStatus(contentId, ContentStatus.PUBLISHED);

      // 콘텐츠에 외부 포스트 ID 저장
      if (platform === PublishPlatform.WORDPRESS) {
        content.wordpressPostId = result.postId || '';
      } else {
        content.mediumPostId = result.postId || '';
      }
      await this.contentRepository.save(content);
    } else {
      publishLog.status = PublishStatus.FAILED;
      publishLog.errorMessage = result?.error || 'Unknown error';
      
      await this.contentService.updateStatus(contentId, ContentStatus.FAILED);
    }

    await this.publishLogRepository.save(publishLog);
    return publishLog;
  }

  async getPublishLogs(contentId: string): Promise<PublishLog[]> {
    return this.publishLogRepository.find({
      where: { contentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 발행 기록 삭제
   */
  async deletePublishLog(logId: string, userId: string): Promise<void> {
    // 발행 로그 조회
    const log = await this.publishLogRepository.findOne({
      where: { id: logId },
      relations: ['content', 'content.project'],
    });

    if (!log) {
      throw new NotFoundException('발행 기록을 찾을 수 없습니다.');
    }

    // 권한 확인
    if (log.content.project.userId !== userId) {
      throw new ForbiddenException('이 발행 기록을 삭제할 권한이 없습니다.');
    }

    // 발행 기록 삭제
    await this.publishLogRepository.remove(log);
    
    this.logger.log(`Published log deleted: ${logId} by user: ${userId}`);
  }
}

