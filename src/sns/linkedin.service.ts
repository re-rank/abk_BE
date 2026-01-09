import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface LinkedInConfig {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  redirectUri?: string;
}

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope: string;
}

interface PostResult {
  success: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

@Injectable()
export class LinkedinService {
  private readonly logger = new Logger(LinkedinService.name);

  constructor(private configService: ConfigService) {}

  private getConfig(): LinkedInConfig {
    return {
      clientId: this.configService.get('LINKEDIN_CLIENT_ID') || '',
      clientSecret: this.configService.get('LINKEDIN_CLIENT_SECRET') || '',
      accessToken: this.configService.get('LINKEDIN_ACCESS_TOKEN') || '',
      redirectUri: this.configService.get('LINKEDIN_REDIRECT_URI') || 'http://localhost:3000/auth/linkedin/callback',
    };
  }

  /**
   * OAuth Authorization URL 생성
   * @param state - OAuth state 파라미터
   * @param clientId - 프로젝트별 Client ID (DB에서 가져온 값)
   * @param redirectUri - 콜백 URL (선택적)
   */
  getAuthorizationUrl(state?: string, clientId?: string, redirectUri?: string): string {
    const config = this.getConfig();
    const finalClientId = clientId || config.clientId || '';
    const finalRedirectUri = redirectUri || config.redirectUri || '';
    
    const scopes = ['openid', 'profile', 'email', 'w_member_social'];
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: finalClientId,
      redirect_uri: finalRedirectUri,
      scope: scopes.join(' '),
      ...(state && { state }),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Authorization Code → Access Token 교환
   * @param code - Authorization Code
   * @param clientId - 프로젝트별 Client ID (DB에서 가져온 값)
   * @param clientSecret - 프로젝트별 Client Secret (DB에서 가져온 값)
   * @param redirectUri - 콜백 URL
   */
  async exchangeCodeForToken(
    code: string,
    clientId?: string,
    clientSecret?: string,
    redirectUri?: string,
  ): Promise<LinkedInTokenResponse | null> {
    const config = this.getConfig();
    const finalClientId = clientId || config.clientId;
    const finalClientSecret = clientSecret || config.clientSecret;
    const finalRedirectUri = redirectUri || config.redirectUri || '';
    
    if (!finalClientId || !finalClientSecret) {
      this.logger.error('LinkedIn Client ID/Secret이 설정되지 않았습니다.');
      return null;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: finalClientId,
        client_secret: finalClientSecret,
        redirect_uri: finalRedirectUri,
      });

      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`LinkedIn token exchange failed: ${errorData}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`LinkedIn token exchange error: ${error}`);
      return null;
    }
  }

  /**
   * Refresh Token으로 Access Token 갱신
   */
  async refreshAccessToken(refreshToken: string): Promise<LinkedInTokenResponse | null> {
    const config = this.getConfig();
    
    if (!config.clientId || !config.clientSecret) {
      this.logger.error('LinkedIn Client ID/Secret이 설정되지 않았습니다.');
      return null;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`LinkedIn token refresh failed: ${errorData}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`LinkedIn token refresh error: ${error}`);
      return null;
    }
  }

  async getUserId(accessToken: string): Promise<string | null> {
    try {
      // OpenID Connect를 사용하는 경우 userinfo 엔드포인트 사용
      const response = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`LinkedIn userinfo failed: ${response.status} - ${errorText}`);
        
        // userinfo 실패 시 me 엔드포인트 시도 (fallback)
        const meResponse = await fetch('https://api.linkedin.com/v2/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        
        if (!meResponse.ok) {
          const meErrorText = await meResponse.text();
          this.logger.error(`LinkedIn me also failed: ${meResponse.status} - ${meErrorText}`);
          return null;
        }
        
        const meData = await meResponse.json();
        this.logger.log(`LinkedIn user ID from /me: ${meData.id}`);
        return meData.id;
      }

      const data = await response.json();
      // userinfo 엔드포인트는 'sub' 필드에 사용자 ID를 반환
      this.logger.log(`LinkedIn user ID from /userinfo: ${data.sub}`);
      return data.sub;
    } catch (error) {
      this.logger.error(`LinkedIn get user error: ${error}`);
      return null;
    }
  }

  async postShare(text: string, url?: string, accessToken?: string): Promise<PostResult> {
    try {
      const config = this.getConfig();
      const token = accessToken || config.accessToken;
      
      if (!token) {
        return {
          success: false,
          error: 'LinkedIn API 설정이 완료되지 않았습니다.',
        };
      }

      const userId = await this.getUserId(token);
      if (!userId) {
        return {
          success: false,
          error: 'LinkedIn 사용자 정보를 가져올 수 없습니다.',
        };
      }

      const shareContent: Record<string, unknown> = {
        author: `urn:li:person:${userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text,
            },
            shareMediaCategory: url ? 'ARTICLE' : 'NONE',
            ...(url && {
              media: [
                {
                  status: 'READY',
                  originalUrl: url,
                },
              ],
            }),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(shareContent),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`LinkedIn post failed: ${errorData}`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${errorData}`,
        };
      }

      const data = await response.json();

      return {
        success: true,
        postId: data.id,
        postUrl: `https://www.linkedin.com/feed/update/${data.id}`,
      };
    } catch (error) {
      this.logger.error(`LinkedIn post error: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  generatePostText(
    title: string,
    summary: string,
    brandName: string,
    maxLength: number = 3000,
  ): string {
    const header = `📢 ${title}\n\n`;
    const footer = `\n\n#${brandName.replace(/\s/g, '')} #전문가`;
    
    const availableLength = maxLength - header.length - footer.length;
    
    let postSummary = summary;
    if (postSummary.length > availableLength) {
      postSummary = postSummary.substring(0, availableLength - 3) + '...';
    }

    return `${header}${postSummary}${footer}`;
  }
}

