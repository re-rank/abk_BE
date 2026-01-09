import { Injectable, Logger } from '@nestjs/common';

interface WordPressConfig {
  apiUrl: string;
  username: string;
  appPassword: string;
}

interface PublishResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

@Injectable()
export class WordpressService {
  private readonly logger = new Logger(WordpressService.name);

  async publish(
    config: WordPressConfig,
    title: string,
    content: string,
    status: 'publish' | 'draft' = 'publish',
  ): Promise<PublishResult> {
    try {
      const credentials = Buffer.from(
        `${config.username}:${config.appPassword}`,
      ).toString('base64');

      const response = await fetch(`${config.apiUrl}/wp/v2/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          title,
          content,
          status,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`WordPress publish failed: ${errorData}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        postId: String(data.id),
        postUrl: data.link,
      };
    } catch (error) {
      this.logger.error(`WordPress publish error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updatePost(
    config: WordPressConfig,
    postId: string,
    title: string,
    content: string,
  ): Promise<PublishResult> {
    try {
      const credentials = Buffer.from(
        `${config.username}:${config.appPassword}`,
      ).toString('base64');

      const response = await fetch(`${config.apiUrl}/wp/v2/posts/${postId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify({
          title,
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        postId: String(data.id),
        postUrl: data.link,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deletePost(config: WordPressConfig, postId: string): Promise<boolean> {
    try {
      const credentials = Buffer.from(
        `${config.username}:${config.appPassword}`,
      ).toString('base64');

      const response = await fetch(`${config.apiUrl}/wp/v2/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Basic ${credentials}`,
        },
      });

      return response.ok;
    } catch (error) {
      this.logger.error(`WordPress delete error: ${error}`);
      return false;
    }
  }
}

