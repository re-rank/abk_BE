import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

@Injectable()
export class TwitterService {
  private readonly logger = new Logger(TwitterService.name);

  constructor(private configService: ConfigService) {}

  private getConfig(): TwitterConfig {
    return {
      apiKey: this.configService.get('TWITTER_API_KEY') || '',
      apiSecret: this.configService.get('TWITTER_API_SECRET') || '',
      accessToken: this.configService.get('TWITTER_ACCESS_TOKEN') || '',
      accessSecret: this.configService.get('TWITTER_ACCESS_SECRET') || '',
    };
  }

  async postTweet(text: string): Promise<PostResult> {
    try {
      const config = this.getConfig();
      
      if (!config.apiKey || !config.accessToken) {
        return {
          success: false,
          error: 'Twitter API 설정이 완료되지 않았습니다.',
        };
      }

      // Twitter API v2 사용
      // OAuth 1.0a 인증이 필요하므로 실제 구현에서는 twitter-api-v2 라이브러리 사용 권장
      // 여기서는 기본 구조만 제공
      
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 실제로는 OAuth 헤더가 필요함
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          text: text.substring(0, 280), // Twitter 글자 제한
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Twitter post failed: ${errorData}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        postId: data.data?.id,
        postUrl: `https://twitter.com/i/status/${data.data?.id}`,
      };
    } catch (error) {
      this.logger.error(`Twitter post error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  generateTweetText(
    title: string,
    url: string,
    brandName: string,
    maxLength: number = 280,
  ): string {
    const suffix = `\n\n${brandName}\n${url}`;
    const availableLength = maxLength - suffix.length;
    
    let tweetTitle = title;
    if (tweetTitle.length > availableLength) {
      tweetTitle = tweetTitle.substring(0, availableLength - 3) + '...';
    }

    return `${tweetTitle}${suffix}`;
  }
}

