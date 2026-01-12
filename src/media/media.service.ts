import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MediaConnection,
  MediaPlatform,
  ConnectionStatus,
  AuthType,
} from '../database/entities/media-connection.entity';
import { Project } from '../database/entities/project.entity';
import { CreateMediaConnectionDto } from './dto/create-media-connection.dto';
import { PlaywrightAuthService } from './playwright-auth.service';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(MediaConnection)
    private mediaConnectionRepository: Repository<MediaConnection>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    private playwrightAuthService: PlaywrightAuthService,
  ) {}

  /**
   * 프로젝트의 소유권 검증 (보안 - 다른 프로젝트 접근 방지)
   */
  private async verifyProjectOwnership(
    projectId: string,
    userId: string,
  ): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    if (project.userId !== userId) {
      throw new ForbiddenException('이 프로젝트에 접근할 권한이 없습니다.');
    }

    return project;
  }

  /**
   * 프로젝트의 모든 매체 연동 목록 조회
   */
  async findAllByProject(
    projectId: string,
    userId: string,
  ): Promise<MediaConnection[]> {
    // 프로젝트 소유권 검증
    await this.verifyProjectOwnership(projectId, userId);

    return this.mediaConnectionRepository.find({
      where: { projectId, userId }, // 이중 검증
      order: { platform: 'ASC' },
    });
  }

  /**
   * 특정 매체 연동 조회
   */
  async findOne(id: string, userId: string): Promise<MediaConnection> {
    const connection = await this.mediaConnectionRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!connection) {
      throw new NotFoundException('매체 연동 정보를 찾을 수 없습니다.');
    }

    // 보안: 사용자 ID 검증
    if (connection.userId !== userId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return connection;
  }

  /**
   * 프로젝트 + 플랫폼별 연동 정보 조회
   */
  async findByProjectAndPlatform(
    projectId: string,
    platform: MediaPlatform,
    userId: string,
  ): Promise<MediaConnection | null> {
    // 프로젝트 소유권 검증
    await this.verifyProjectOwnership(projectId, userId);

    return this.mediaConnectionRepository.findOne({
      where: { projectId, platform, userId }, // 이중 검증
    });
  }

  /**
   * 매체 연동 생성/업데이트 (프로젝트별)
   */
  async createOrUpdate(
    userId: string,
    dto: CreateMediaConnectionDto,
  ): Promise<MediaConnection> {
    const {
      projectId,
      platform,
      apiUrl,
      username,
      password,
      apiKey,
      apiSecret,
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      accessTokenSecret,
    } = dto;

    // 프로젝트 소유권 검증
    await this.verifyProjectOwnership(projectId, userId);

    // 기존 연동 확인 (해당 프로젝트 + 플랫폼)
    let connection = await this.mediaConnectionRepository.findOne({
      where: { projectId, platform },
    });

    const authType = this.getAuthType(platform);

    if (connection) {
      // 보안: 다른 사용자의 연동 수정 방지
      if (connection.userId !== userId) {
        throw new ForbiddenException('이 연동 정보를 수정할 권한이 없습니다.');
      }

      // 인증 정보가 변경되었는지 확인
      const credentialsChanged =
        (apiUrl && apiUrl !== connection.apiUrl) ||
        (username && username !== connection.username) ||
        (password && password !== connection.password) ||
        (clientId && clientId !== connection.clientId) ||
        (clientSecret && clientSecret !== connection.clientSecret) ||
        (accessToken && accessToken !== connection.accessToken);

      // 업데이트
      connection.apiUrl = apiUrl || connection.apiUrl;
      connection.username = username || connection.username;
      connection.password = password || connection.password;
      connection.clientId = clientId || connection.clientId;
      connection.clientSecret = clientSecret || connection.clientSecret;
      connection.accessToken = accessToken || connection.accessToken;
      connection.refreshToken = refreshToken || connection.refreshToken;
      
      // 인증 정보가 변경된 경우에만 상태를 DISCONNECTED로 리셋
      if (credentialsChanged) {
        connection.status = ConnectionStatus.DISCONNECTED;
      }
      // 기존 상태 유지 (이미 CONNECTED면 유지)
    } else {
      // 새로 생성
      connection = this.mediaConnectionRepository.create({
        userId,
        projectId, // 프로젝트별 분리
        platform,
        authType,
        apiUrl,
        username,
        password,
        clientId,
        clientSecret,
        accessToken,
        refreshToken,
        status: ConnectionStatus.DISCONNECTED,
      });
    }

    // X/Twitter의 경우 추가 정보 저장
    if (platform === MediaPlatform.X) {
      connection.refreshToken = accessTokenSecret;
    }

    return this.mediaConnectionRepository.save(connection);
  }

  /**
   * 매체 연동 테스트
   */
  async testConnection(
    id: string,
    userId: string,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    const connection = await this.findOne(id, userId);

    try {
      let result: {
        success: boolean;
        message: string;
        accountInfo?: { name: string; url?: string };
      };

      switch (connection.platform) {
        case MediaPlatform.WORDPRESS:
          result = await this.testWordPressConnection(connection);
          break;
        case MediaPlatform.X:
          result = await this.testXConnection(connection);
          break;
        case MediaPlatform.LINKEDIN:
          result = await this.testLinkedInConnection(connection);
          break;
        case MediaPlatform.NAVER_BLOG:
        case MediaPlatform.TISTORY:
          result = await this.testPlaywrightConnection(connection);
          break;
        default:
          result = { success: false, message: '지원하지 않는 플랫폼입니다.' };
      }

      // 연동 상태 업데이트
      connection.status = result.success
        ? ConnectionStatus.CONNECTED
        : ConnectionStatus.ERROR;
      connection.lastCheckedAt = new Date();
      connection.lastError = result.success ? undefined : result.message;

      if (result.accountInfo) {
        connection.accountName = result.accountInfo.name;
        connection.accountUrl = result.accountInfo.url;
      }

      await this.mediaConnectionRepository.save(connection);

      return result;
    } catch (error) {
      connection.status = ConnectionStatus.ERROR;
      connection.lastCheckedAt = new Date();
      connection.lastError = error.message;
      await this.mediaConnectionRepository.save(connection);

      return { success: false, message: error.message };
    }
  }

  /**
   * 매체 연동 삭제
   */
  async remove(id: string, userId: string): Promise<void> {
    const connection = await this.findOne(id, userId);
    await this.mediaConnectionRepository.remove(connection);
  }

  /**
   * 프로젝트의 모든 플랫폼 연동 상태 요약
   */
  async getConnectionSummary(
    projectId: string,
    userId: string,
  ): Promise<
    {
      platform: MediaPlatform;
      status: ConnectionStatus;
      authType: AuthType;
      accountName?: string;
      lastCheckedAt?: Date;
      connectionId?: string;
    }[]
  > {
    // 프로젝트 소유권 검증
    await this.verifyProjectOwnership(projectId, userId);

    const connections = await this.findAllByProject(projectId, userId);

    // 모든 플랫폼에 대해 상태 반환
    const allPlatforms = Object.values(MediaPlatform);

    return allPlatforms.map((platform) => {
      const connection = connections.find((c) => c.platform === platform);
      return {
        platform,
        status: connection?.status || ConnectionStatus.DISCONNECTED,
        authType: this.getAuthType(platform),
        accountName: connection?.accountName,
        lastCheckedAt: connection?.lastCheckedAt,
        connectionId: connection?.id,
      };
    });
  }

  /**
   * 플랫폼별 인증 타입 결정
   */
  private getAuthType(platform: MediaPlatform): AuthType {
    switch (platform) {
      case MediaPlatform.WORDPRESS:
        return AuthType.API_KEY;
      case MediaPlatform.X:
      case MediaPlatform.LINKEDIN:
        return AuthType.OAUTH;
      case MediaPlatform.NAVER_BLOG:
      case MediaPlatform.TISTORY:
        return AuthType.PLAYWRIGHT;
      default:
        return AuthType.API_KEY;
    }
  }

  /**
   * WordPress REST API 연동 테스트
   * @see https://developer.wordpress.org/rest-api/
   */
  private async testWordPressConnection(
    connection: MediaConnection,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    if (!connection.apiUrl || !connection.username || !connection.password) {
      return {
        success: false,
        message: 'WordPress API URL, 사용자명, 앱 비밀번호가 필요합니다.',
      };
    }

    // API URL 정규화
    let apiUrl = connection.apiUrl.trim();
    
    // 끝에 슬래시 제거
    if (apiUrl.endsWith('/')) {
      apiUrl = apiUrl.slice(0, -1);
    }
    
    // /wp-json이 없으면 추가
    if (!apiUrl.endsWith('/wp-json') && !apiUrl.includes('/wp-json/')) {
      apiUrl = `${apiUrl}/wp-json`;
    }
    
    // /wp/v2가 포함되어 있으면 /wp-json까지만 사용
    if (apiUrl.includes('/wp/v2')) {
      apiUrl = apiUrl.split('/wp/v2')[0];
    }

    try {
      // 먼저 REST API가 활성화되어 있는지 확인
      const discoveryResponse = await fetch(apiUrl, {
        headers: { 'Accept': 'application/json' },
      });
      
      const discoveryText = await discoveryResponse.text();
      
      // HTML 응답인지 확인
      if (discoveryText.trim().startsWith('<!DOCTYPE') || discoveryText.trim().startsWith('<html')) {
        return {
          success: false,
          message: `WordPress REST API가 응답하지 않습니다. 
URL을 확인해주세요: ${apiUrl}
- 올바른 형식: https://your-site.com/wp-json
- 퍼머링크 설정이 "기본"이 아닌지 확인
- REST API가 비활성화되어 있는지 확인`,
        };
      }
      
      // JSON 파싱 시도
      let discoveryData;
      try {
        discoveryData = JSON.parse(discoveryText);
      } catch {
        return {
          success: false,
          message: `유효하지 않은 응답입니다. WordPress REST API URL을 확인해주세요: ${apiUrl}`,
        };
      }
      
      // WordPress REST API인지 확인
      if (!discoveryData.namespaces || !discoveryData.namespaces.includes('wp/v2')) {
        return {
          success: false,
          message: 'WordPress REST API를 찾을 수 없습니다. URL을 확인해주세요.',
        };
      }

      // 인증 테스트
      const authHeader = Buffer.from(
        `${connection.username}:${connection.password}`,
      ).toString('base64');

      const response = await fetch(`${apiUrl}/wp/v2/users/me`, {
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Accept': 'application/json',
        },
      });

      const responseText = await response.text();
      
      // HTML 응답 체크
      if (responseText.trim().startsWith('<!DOCTYPE') || responseText.trim().startsWith('<html')) {
        return {
          success: false,
          message: 'WordPress 인증에 실패했습니다. 앱 비밀번호가 올바른지 확인해주세요.',
        };
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        return {
          success: false,
          message: '응답을 파싱할 수 없습니다.',
        };
      }

      if (response.ok) {
        // 연결 정보에 정규화된 URL 저장
        connection.apiUrl = apiUrl;
        
        return {
          success: true,
          message: 'WordPress 연동 성공',
          accountInfo: {
            name: data.name || data.slug,
            url: data.link,
          },
        };
      } else {
        // 오류 메시지 처리
        let errorMessage = 'WordPress 인증 실패';
        
        if (data.code === 'invalid_username') {
          errorMessage = '사용자명이 올바르지 않습니다.';
        } else if (data.code === 'incorrect_password') {
          errorMessage = '앱 비밀번호가 올바르지 않습니다. (일반 비밀번호가 아닌 앱 비밀번호를 사용해주세요)';
        } else if (data.code === 'rest_forbidden') {
          errorMessage = 'REST API 접근이 거부되었습니다. 관리자 권한이 필요합니다.';
        } else if (data.code === 'rest_not_logged_in' || data.message?.includes('로그인')) {
          errorMessage = `인증에 실패했습니다. 다음을 확인해주세요:
1. 일반 비밀번호가 아닌 "앱 비밀번호"를 사용해야 합니다
2. WordPress 관리자 → 사용자 → 프로필 → "응용 프로그램 비밀번호" 섹션에서 발급
3. 앱 비밀번호는 공백 포함 전체를 입력해주세요 (예: abcd 1234 efgh 5678)
4. HTTPS 사이트에서만 앱 비밀번호가 작동합니다`;
        } else if (data.message) {
          errorMessage = data.message;
        }
        
        return {
          success: false,
          message: errorMessage,
        };
      }
    } catch (error) {
      // 네트워크 오류 처리
      if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
        return { 
          success: false, 
          message: `사이트를 찾을 수 없습니다. URL을 확인해주세요: ${apiUrl}` 
        };
      }
      if (error.message.includes('ECONNREFUSED')) {
        return { 
          success: false, 
          message: `서버에 연결할 수 없습니다. 사이트가 온라인인지 확인해주세요.` 
        };
      }
      if (error.message.includes('ETIMEDOUT')) {
        return { 
          success: false, 
          message: `연결 시간이 초과되었습니다. 서버 상태를 확인해주세요.` 
        };
      }
      
      return { success: false, message: `WordPress 연결 실패: ${error.message}` };
    }
  }

  /**
   * X (Twitter) API 연동 테스트
   */
  private async testXConnection(
    connection: MediaConnection,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    if (!connection.accessToken) {
      return { success: false, message: 'X API 인증 정보가 필요합니다.' };
    }

    try {
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: 'X 연동 성공',
          accountInfo: {
            name: data.data?.name || data.data?.username,
            url: `https://x.com/${data.data?.username}`,
          },
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          message: error.detail || error.title || 'X 인증 실패',
        };
      }
    } catch (error) {
      return { success: false, message: `X 연결 실패: ${error.message}` };
    }
  }

  /**
   * LinkedIn API 연동 테스트
   */
  private async testLinkedInConnection(
    connection: MediaConnection,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    // Client ID/Secret만 있고 Access Token이 없는 경우 (OAuth 인증 전)
    if (!connection.accessToken && connection.clientId && connection.clientSecret) {
      return {
        success: true,
        message: 'Client ID/Secret이 저장되었습니다. OAuth 인증을 진행해주세요.',
      };
    }

    // Access Token도 없고 Client ID/Secret도 없는 경우
    if (!connection.accessToken) {
      return { 
        success: false, 
        message: 'LinkedIn Client ID와 Client Secret을 먼저 입력해주세요.' 
      };
    }

    // Access Token이 있는 경우 - 실제 연결 테스트
    try {
      const response = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
        },
      });

      if (response.ok) {
        const profile = await response.json();
        return {
          success: true,
          message: 'LinkedIn 연동 성공',
          accountInfo: {
            name: profile.name || `${profile.given_name} ${profile.family_name}`,
            url: `https://www.linkedin.com/in/${profile.sub}`,
          },
        };
      } else {
        return { success: false, message: 'LinkedIn 인증 실패' };
      }
    } catch (error) {
      return { success: false, message: `LinkedIn 연결 실패: ${error.message}` };
    }
  }

  /**
   * Playwright 기반 연동 테스트 (네이버 블로그, 티스토리)
   * - 쿠키가 있으면 HTTP 요청으로 쿠키 유효성 검사 (가볍고 안정적)
   * - 쿠키가 없고 username/password가 있으면 Playwright로 로그인 테스트
   */
  private async testPlaywrightConnection(
    connection: MediaConnection,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    // 쿠키가 있으면 HTTP 요청으로 쿠키 유효성 검사 (Playwright 없이)
    if (connection.accessToken) {
      return this.testConnectionWithCookies(connection);
    }

    // 쿠키가 없으면 username/password 필요
    if (!connection.username || !connection.password) {
      return { success: false, message: '쿠키 또는 아이디/비밀번호가 필요합니다. 수동 로그인을 진행해주세요.' };
    }

    try {
      const result = await this.playwrightAuthService.testAuth(
        connection.platform,
        connection.username,
        connection.password,
      );

      // 세션 쿠키 저장 (나중에 통계 수집용)
      if (result.success && result.cookies) {
        connection.accessToken = result.cookies; // 쿠키를 accessToken 필드에 저장
      }

      return {
        success: result.success,
        message: result.message,
        accountInfo: result.accountInfo ? {
          name: result.accountInfo.name,
          url: result.accountInfo.url,
        } : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `연동 테스트 실패: ${error.message}`,
      };
    }
  }

  /**
   * 쿠키로 연동 테스트 (HTTP 요청 기반, Playwright 없이)
   */
  private async testConnectionWithCookies(
    connection: MediaConnection,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string };
  }> {
    const cookies = connection.accessToken;
    if (!cookies) {
      return { success: false, message: '쿠키가 없습니다.' };
    }

    try {
      if (connection.platform === MediaPlatform.NAVER_BLOG) {
        // 네이버 블로그 쿠키 테스트
        const response = await fetch('https://blog.naver.com/MyBlog.naver', {
          method: 'GET',
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          redirect: 'manual', // 리다이렉트 수동 처리
        });

        // 로그인 페이지로 리다이렉트되면 쿠키 만료
        const location = response.headers.get('location') || '';
        if (response.status === 302 && (location.includes('nidlogin') || location.includes('login'))) {
          return { success: false, message: '쿠키가 만료되었습니다. 다시 로그인해주세요.' };
        }

        // 200 응답이면 로그인 성공
        if (response.status === 200) {
          return {
            success: true,
            message: '네이버 블로그 연동이 정상입니다.',
            accountInfo: connection.accountName ? {
              name: connection.accountName,
              url: connection.accountUrl,
            } : undefined,
          };
        }

        return { success: false, message: `연동 테스트 실패 (상태 코드: ${response.status})` };
      } else if (connection.platform === MediaPlatform.TISTORY) {
        // 티스토리 쿠키 테스트
        const response = await fetch('https://www.tistory.com/manage', {
          method: 'GET',
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          redirect: 'manual',
        });

        // 로그인 페이지로 리다이렉트되면 쿠키 만료
        const location = response.headers.get('location') || '';
        if (response.status === 302 && location.includes('login')) {
          return { success: false, message: '쿠키가 만료되었습니다. 다시 로그인해주세요.' };
        }

        // 200 응답이면 로그인 성공
        if (response.status === 200) {
          return {
            success: true,
            message: '티스토리 연동이 정상입니다.',
            accountInfo: connection.accountName ? {
              name: connection.accountName,
              url: connection.accountUrl,
            } : undefined,
          };
        }

        return { success: false, message: `연동 테스트 실패 (상태 코드: ${response.status})` };
      }

      return { success: false, message: '지원하지 않는 플랫폼입니다.' };
    } catch (error) {
      return {
        success: false,
        message: `연동 테스트 중 오류: ${error.message}`,
      };
    }
  }

  /**
   * 수동 로그인 후 쿠키 업데이트 (2차 인증 지원)
   * 
   * 브라우저에서 직접 로그인(2차 인증 완료) 후 쿠키를 저장합니다.
   */
  async updateCookies(
    projectId: string,
    platform: 'TISTORY' | 'NAVER_BLOG',
    cookies: string,
    accountInfo?: { name: string; url?: string; blogId?: string },
    userId?: string,
  ): Promise<{ success: boolean; message: string; connectionId?: string }> {
    try {
      // 프로젝트 소유권 검증
      if (userId) {
        await this.verifyProjectOwnership(projectId, userId);
      }

      const mediaPlatform = platform === 'TISTORY' ? MediaPlatform.TISTORY : MediaPlatform.NAVER_BLOG;

      // 기존 연동 확인
      let connection = await this.mediaConnectionRepository.findOne({
        where: { projectId, platform: mediaPlatform },
      });

      if (connection) {
        // 기존 연동 업데이트
        connection.accessToken = cookies;
        connection.status = ConnectionStatus.CONNECTED;
        connection.lastCheckedAt = new Date();
        connection.lastError = undefined;

        if (accountInfo) {
          connection.accountName = accountInfo.name;
          connection.accountUrl = accountInfo.url;
        }

        await this.mediaConnectionRepository.save(connection);

        return {
          success: true,
          message: '쿠키가 성공적으로 업데이트되었습니다.',
          connectionId: connection.id,
        };
      } else {
        // 새 연동 생성
        const project = await this.projectRepository.findOne({
          where: { id: projectId },
        });

        if (!project) {
          return { success: false, message: '프로젝트를 찾을 수 없습니다.' };
        }

        connection = this.mediaConnectionRepository.create({
          userId: project.userId || '',
          projectId,
          platform: mediaPlatform,
          authType: AuthType.PLAYWRIGHT,
          accessToken: cookies,
          status: ConnectionStatus.CONNECTED,
          lastCheckedAt: new Date(),
          accountName: accountInfo?.name,
          accountUrl: accountInfo?.url,
        } as Partial<MediaConnection>);

        const saved = await this.mediaConnectionRepository.save(connection);

        return {
          success: true,
          message: '새 연동이 생성되고 쿠키가 저장되었습니다.',
          connectionId: saved.id,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `쿠키 저장 실패: ${error.message}`,
      };
    }
  }
}
