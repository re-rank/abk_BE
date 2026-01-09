import { Injectable, Logger } from '@nestjs/common';

interface MediumConfig {
  accessToken: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

@Injectable()
export class MediumService {
  private readonly logger = new Logger(MediumService.name);
  private readonly baseUrl = 'https://api.medium.com/v1';

  async getUserId(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.data?.id || null;
    } catch (error) {
      this.logger.error(`Medium get user error: ${error}`);
      return null;
    }
  }

  async publish(
    config: MediumConfig,
    title: string,
    content: string,
    tags: string[] = [],
    publishStatus: 'public' | 'draft' | 'unlisted' = 'public',
  ): Promise<PublishResult> {
    try {
      // 먼저 사용자 ID 가져오기
      const userId = await this.getUserId(config.accessToken);
      
      if (!userId) {
        return {
          success: false,
          error: 'Failed to get Medium user ID',
        };
      }

      const response = await fetch(`${this.baseUrl}/users/${userId}/posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          contentFormat: 'html',
          content: `<h1>${title}</h1>${content}`,
          tags: tags.slice(0, 5), // Medium은 최대 5개 태그
          publishStatus,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Medium publish failed: ${errorData}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        postId: data.data?.id,
        postUrl: data.data?.url,
      };
    } catch (error) {
      this.logger.error(`Medium publish error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

