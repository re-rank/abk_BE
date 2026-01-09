import { Injectable, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SnsPost, SnsPlatform, SnsPostStatus } from '../database/entities/sns-post.entity';
import { MediaConnection, MediaPlatform, ConnectionStatus } from '../database/entities/media-connection.entity';
import { TwitterService } from './twitter.service';
import { LinkedinService } from './linkedin.service';
import { ContentService } from '../content/content.service';
import { ShareContentDto } from './dto/share-content.dto';

@Injectable()
export class SnsService {
  constructor(
    @InjectRepository(SnsPost)
    private snsPostRepository: Repository<SnsPost>,
    @InjectRepository(MediaConnection)
    private mediaConnectionRepository: Repository<MediaConnection>,
    private twitterService: TwitterService,
    private linkedinService: LinkedinService,
    @Inject(forwardRef(() => ContentService))
    private contentService: ContentService,
  ) {}

  async share(userId: string, shareDto: ShareContentDto): Promise<SnsPost> {
    const { contentId, platform } = shareDto;

    // 콘텐츠 조회
    const content = await this.contentService.findById(contentId);
    
    if (!content) {
      throw new NotFoundException('콘텐츠를 찾을 수 없습니다.');
    }

    if (content.project.userId !== userId) {
      throw new ForbiddenException('이 콘텐츠에 접근할 권한이 없습니다.');
    }

    const project = content.project;
    
    // 콘텐츠 요약 생성 (처음 200자)
    const summary = content.body.substring(0, 200) + '...';
    
    let postContent: string;
    let result;

    if (platform === SnsPlatform.TWITTER) {
      postContent = this.twitterService.generateTweetText(
        content.title,
        project.targetUrl,
        project.brandName,
      );
      result = await this.twitterService.postTweet(postContent);
    } else {
      // LinkedIn 연동 정보에서 access token 가져오기
      const linkedinConnection = await this.mediaConnectionRepository.findOne({
        where: {
          projectId: project.id,
          platform: MediaPlatform.LINKEDIN,
          status: ConnectionStatus.CONNECTED,
        },
      });
      
      postContent = this.linkedinService.generatePostText(
        content.title,
        summary,
        project.brandName,
      );
      
      if (!linkedinConnection?.accessToken) {
        result = {
          success: false,
          error: 'LinkedIn 연동이 설정되지 않았습니다. 매체 관리에서 LinkedIn을 연동해주세요.',
        };
      } else {
        result = await this.linkedinService.postShare(postContent, project.targetUrl, linkedinConnection.accessToken);
      }
    }

    // SNS 포스트 기록 생성
    const snsPost = this.snsPostRepository.create({
      contentId,
      platform,
      postContent,
      status: result.success ? SnsPostStatus.SUCCESS : SnsPostStatus.FAILED,
      externalPostId: result.postId,
      postUrl: result.postUrl,
      errorMessage: result.error,
    });

    return this.snsPostRepository.save(snsPost);
  }

  async getSnsPosts(contentId: string): Promise<SnsPost[]> {
    return this.snsPostRepository.find({
      where: { contentId },
      order: { createdAt: 'DESC' },
    });
  }
}

