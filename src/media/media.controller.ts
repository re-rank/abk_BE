import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { MediaService } from './media.service';
import { CreateMediaConnectionDto } from './dto/create-media-connection.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { PlaywrightAuthService } from './playwright-auth.service';
import { BrowserlessService } from './browserless.service';
import { LinkedinService } from '../sns/linkedin.service';
import { JwtService } from '@nestjs/jwt';
import { MediaPlatform } from '../database/entities/media-connection.entity';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('Media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly playwrightAuthService: PlaywrightAuthService,
    private readonly browserlessService: BrowserlessService,
    private readonly linkedinService: LinkedinService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  @Get()
  @ApiOperation({ summary: '프로젝트의 모든 매체 연동 목록 조회' })
  @ApiQuery({ name: 'projectId', required: true, description: '프로젝트 ID' })
  findAll(
    @Query('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mediaService.findAllByProject(projectId, user.userId);
  }

  @Get('summary')
  @ApiOperation({ summary: '프로젝트의 매체 연동 상태 요약' })
  @ApiQuery({ name: 'projectId', required: true, description: '프로젝트 ID' })
  getSummary(
    @Query('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.mediaService.getConnectionSummary(projectId, user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 매체 연동 상세 조회' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.mediaService.findOne(id, user.userId);
  }

  @Post()
  @ApiOperation({ summary: '매체 연동 생성/업데이트 (프로젝트별)' })
  createOrUpdate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateMediaConnectionDto,
  ) {
    return this.mediaService.createOrUpdate(user.userId, dto);
  }

  @Post(':id/test')
  @ApiOperation({ summary: '매체 연동 테스트' })
  testConnection(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.mediaService.testConnection(id, user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '매체 연동 삭제' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.mediaService.remove(id, user.userId);
  }

  // ========== 수동 로그인 (2차 인증 지원) ==========

  @Post('manual-login/save-cookies')
  @ApiOperation({
    summary: '쿠키 직접 저장 (수동 로그인)',
    description: '브라우저에서 직접 복사한 쿠키를 저장합니다. 개발자도구 > Application > Cookies에서 복사하세요.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '프로젝트 ID' },
        platform: { type: 'string', enum: ['tistory', 'naver'], description: '플랫폼' },
        cookies: { type: 'string', description: '쿠키 문자열 (JSON 배열 또는 key=value; 형식)' },
        blogName: { type: 'string', description: '블로그 이름 (선택)' },
        blogUrl: { type: 'string', description: '블로그 URL (선택)' },
      },
      required: ['projectId', 'platform', 'cookies'],
    },
  })
  async saveDirectCookies(
    @CurrentUser() user: AuthUser,
    @Body('projectId') projectId: string,
    @Body('platform') platform: 'tistory' | 'naver',
    @Body('cookies') cookies: string,
    @Body('blogName') blogName?: string,
    @Body('blogUrl') blogUrl?: string,
  ): Promise<{
    success: boolean;
    message: string;
    connectionId?: string;
  }> {
    // 플랫폼 매핑
    const platformMap = {
      tistory: 'TISTORY',
      naver: 'NAVER_BLOG',
    };

    // 쿠키 형식 정규화 (다양한 형식 지원)
    let normalizedCookies = cookies.trim();

    // 1. JSON 배열 형식 시도: [{name: 'xxx', value: 'yyy'}, ...]
    try {
      const parsed = JSON.parse(normalizedCookies);
      if (Array.isArray(parsed)) {
        normalizedCookies = parsed
          .map((c: any) => `${c.name}=${c.value}`)
          .join('; ');
      }
    } catch {
      // JSON이 아니면 다른 형식 시도

      // 2. Chrome DevTools 탭 구분 형식 (복사 시 탭으로 구분됨)
      // 형식: name\tvalue\tdomain\tpath\t... (각 행이 하나의 쿠키)
      if (normalizedCookies.includes('\t')) {
        const lines = normalizedCookies.split('\n').filter(line => line.trim());
        const cookiePairs: string[] = [];

        for (const line of lines) {
          const parts = line.split('\t');
          // 첫 번째 컬럼이 name, 두 번째가 value
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const value = parts[1].trim();
            // 헤더 행 스킵 (name이 'name'인 경우)
            if (name && value && name.toLowerCase() !== 'name') {
              cookiePairs.push(`${name}=${value}`);
            }
          }
        }

        if (cookiePairs.length > 0) {
          normalizedCookies = cookiePairs.join('; ');
        }
      }
      // 3. 이미 key=value; 형식이면 그대로 사용
    }

    // 티스토리인 경우 블로그 URL이 없으면 자동 추출 시도
    let finalBlogUrl = blogUrl;
    if (platform === 'tistory' && !blogUrl) {
      const extractedUrl = await this.mediaService.extractTistoryBlogUrl(normalizedCookies);
      if (extractedUrl) {
        finalBlogUrl = extractedUrl;
      }
    }

    // 계정 정보
    const accountInfo = blogName || finalBlogUrl ? {
      name: blogName || '',
      url: finalBlogUrl,
    } : undefined;

    // 쿠키 저장
    const result = await this.mediaService.updateCookies(
      projectId,
      platformMap[platform] as 'TISTORY' | 'NAVER_BLOG',
      normalizedCookies,
      accountInfo,
      user.userId,
    );

    return {
      success: result.success,
      message: result.success
        ? finalBlogUrl
          ? `쿠키가 저장되었습니다. 블로그: ${finalBlogUrl}`
          : '쿠키가 저장되었습니다. 연동 테스트를 진행해주세요.'
        : result.message,
      connectionId: result.connectionId,
    };
  }

  @Post('manual-login/instructions')
  @ApiOperation({
    summary: '쿠키 복사 방법 안내',
    description: '플랫폼별 쿠키 복사 방법을 반환합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['tistory', 'naver'], description: '플랫폼' },
      },
      required: ['platform'],
    },
  })
  getCookieInstructions(
    @Body('platform') platform: 'tistory' | 'naver',
  ) {
    const instructions = {
      tistory: {
        loginUrl: 'https://www.tistory.com/auth/login',
        steps: [
          '1. 위 URL을 새 탭에서 열고 티스토리에 로그인합니다 (카카오 로그인 포함).',
          '2. 로그인 완료 후 F12 키를 눌러 개발자 도구를 엽니다.',
          '3. 상단 탭에서 "Application" (애플리케이션)을 클릭합니다. 안 보이면 >> 버튼을 눌러 찾으세요.',
          '4. 왼쪽 사이드바에서 "Cookies"를 클릭하고, 그 아래 "https://www.tistory.com"을 선택합니다.',
          '5. 오른쪽에 쿠키 목록이 표시됩니다. 테이블의 아무 행이나 클릭 후 Ctrl+A로 전체 선택합니다.',
          '6. 테이블 위에서 우클릭 → "Copy" 또는 Ctrl+C로 복사합니다.',
          '7. 복사한 내용을 아래 입력창에 붙여넣기 하세요.',
          '※ 필수 쿠키: TSSESSION (카카오 로그인 시 생성됨)',
        ],
        requiredCookies: ['TSSESSION', 'TSESSION'],
      },
      naver: {
        loginUrl: 'https://nid.naver.com/nidlogin.login',
        steps: [
          '1. 위 URL을 새 탭에서 열고 네이버에 로그인합니다 (2차 인증 포함).',
          '2. 로그인 후 주소창에 https://blog.naver.com 을 입력하여 이동합니다.',
          '3. F12 키를 눌러 개발자 도구를 엽니다.',
          '4. 상단 탭에서 "Application" (애플리케이션)을 클릭합니다. 안 보이면 >> 버튼을 눌러 찾으세요.',
          '5. 왼쪽 사이드바에서 "Cookies"를 클릭하고, 그 아래 "https://blog.naver.com"을 선택합니다.',
          '6. 오른쪽에 쿠키 목록이 표시됩니다. 테이블의 아무 행이나 클릭 후 Ctrl+A로 전체 선택합니다.',
          '7. 테이블 위에서 우클릭 → "Copy" 또는 Ctrl+C로 복사합니다.',
          '8. 복사한 내용을 아래 입력창에 붙여넣기 하세요.',
          '※ 필수 쿠키: NID_AUT, NID_SES, NID_JKL',
        ],
        requiredCookies: ['NID_AUT', 'NID_SES', 'NID_JKL'],
      },
    };

    return instructions[platform];
  }

  // ==================== Browserless.io 원격 브라우저 ====================

  @Post('remote-browser/start')
  @ApiOperation({
    summary: '원격 브라우저 세션 시작',
    description: 'Browserless.io를 통해 원격 브라우저를 열고 로그인 페이지로 이동합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['tistory', 'naver'], description: '플랫폼' },
      },
      required: ['platform'],
    },
  })
  async startRemoteBrowser(
    @Body('platform') platform: 'tistory' | 'naver',
    @CurrentUser() user: AuthUser,
  ): Promise<{
    success: boolean;
    sessionId?: string;
    liveViewUrl?: string;
    message: string;
  }> {
    return this.browserlessService.startSession(platform);
  }

  @Post('remote-browser/save-cookies')
  @ApiOperation({
    summary: '원격 브라우저에서 쿠키 저장',
    description: '사용자가 로그인을 완료한 후 쿠키를 저장합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '세션 ID' },
        projectId: { type: 'string', description: '프로젝트 ID' },
        platform: { type: 'string', enum: ['tistory', 'naver'], description: '플랫폼' },
      },
      required: ['sessionId', 'projectId', 'platform'],
    },
  })
  async saveRemoteBrowserCookies(
    @Body('sessionId') sessionId: string,
    @Body('projectId') projectId: string,
    @Body('platform') platform: 'tistory' | 'naver',
    @CurrentUser() user: AuthUser,
  ): Promise<{
    success: boolean;
    message: string;
    connectionId?: string;
  }> {
    // 1. Browserless에서 쿠키 가져오기
    const result = await this.browserlessService.saveCookies(sessionId);

    if (!result.success || !result.cookies) {
      return {
        success: false,
        message: result.message,
      };
    }

    // 2. 플랫폼 매핑
    const platformMap = {
      tistory: 'TISTORY',
      naver: 'NAVER_BLOG',
    };

    // 3. DB에 쿠키 저장
    const saveResult = await this.mediaService.updateCookies(
      projectId,
      platformMap[platform] as 'TISTORY' | 'NAVER_BLOG',
      result.cookies,
      result.accountInfo,
      user.userId,
    );

    return {
      success: saveResult.success,
      message: saveResult.success
        ? '로그인 정보가 저장되었습니다.'
        : saveResult.message,
      connectionId: saveResult.connectionId,
    };
  }

  @Post('remote-browser/close')
  @ApiOperation({
    summary: '원격 브라우저 세션 종료',
    description: '원격 브라우저 세션을 종료합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '세션 ID' },
      },
      required: ['sessionId'],
    },
  })
  async closeRemoteBrowser(
    @Body('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ success: boolean; message: string }> {
    await this.browserlessService.closeSession(sessionId);
    return {
      success: true,
      message: '세션이 종료되었습니다.',
    };
  }

  @Get('remote-browser/status/:sessionId')
  @ApiOperation({
    summary: '원격 브라우저 세션 상태 확인',
    description: '현재 세션의 상태와 URL을 확인합니다.',
  })
  async getRemoteBrowserStatus(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{
    active: boolean;
    url?: string;
    platform?: string;
  }> {
    return this.browserlessService.getSessionStatus(sessionId);
  }

  // ==================== LinkedIn OAuth ====================

  @Public()
  @Get('linkedin/auth')
  @ApiOperation({ summary: 'LinkedIn OAuth 인증 시작' })
  @ApiQuery({ name: 'projectId', required: true, description: '프로젝트 ID' })
  @ApiQuery({ name: 'token', required: true, description: 'JWT 토큰' })
  async linkedInAuth(
    @Query('projectId') projectId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    // JWT 토큰 검증
    let userId: string;
    try {
      const payload = this.jwtService.verify(token);
      userId = payload.sub;
      console.log('✅ 토큰 검증 성공, userId:', userId);
    } catch {
      console.error('❌ JWT 토큰 검증 실패');
      return res.redirect(`${frontendUrl}/login?error=unauthorized`);
    }
    
    // DB에서 프로젝트의 LinkedIn 연동 정보 가져오기
    const linkedinConnection = await this.mediaService.findByProjectAndPlatform(
      projectId,
      MediaPlatform.LINKEDIN,
      userId,
    );
    
    if (!linkedinConnection?.clientId) {
      console.error('❌ LinkedIn Client ID가 설정되지 않았습니다.');
      return res.redirect(`${frontendUrl}/projects/${projectId}?linkedin_error=no_client_id`);
    }
    
    console.log('✅ LinkedIn Client ID 확인됨');
    
    // state에 userId와 projectId를 JSON으로 인코딩
    const state = Buffer.from(JSON.stringify({
      userId,
      projectId
    })).toString('base64');
    
    // 콜백 URL 설정
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';
    const redirectUri = `${backendUrl}/api/media/linkedin/callback`;
    
    const authUrl = this.linkedinService.getAuthorizationUrl(state, linkedinConnection.clientId, redirectUri);
    return res.redirect(authUrl);
  }

  @Public()
  @Get('linkedin/callback')
  @ApiOperation({ summary: 'LinkedIn OAuth 콜백' })
  @ApiQuery({ name: 'code', required: true, description: 'Authorization Code' })
  @ApiQuery({ name: 'state', required: true, description: 'State (userId + projectId)' })
  async linkedInCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    
    try {
      // state 디코딩
      const { userId, projectId } = JSON.parse(
        Buffer.from(state, 'base64').toString('utf-8')
      );

      // DB에서 프로젝트의 LinkedIn 연동 정보 가져오기 (Client ID/Secret)
      const linkedinConnection = await this.mediaService.findByProjectAndPlatform(
        projectId,
        MediaPlatform.LINKEDIN,
        userId,
      );
      
      if (!linkedinConnection?.clientId || !linkedinConnection?.clientSecret) {
        console.error('❌ LinkedIn Client ID/Secret이 DB에 없습니다.');
        return res.redirect(`${frontendUrl}/projects/${projectId}?linkedin_error=no_credentials`);
      }

      // 콜백 URL 설정
      const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';
      const redirectUri = `${backendUrl}/api/media/linkedin/callback`;

      // 1. Authorization Code → Access Token (DB의 Client ID/Secret 사용)
      const tokenData = await this.linkedinService.exchangeCodeForToken(
        code,
        linkedinConnection.clientId,
        linkedinConnection.clientSecret,
        redirectUri,
      );
      
      if (!tokenData) {
        // 실패 시 프론트엔드로 redirect with error
        return res.redirect(`${frontendUrl}/projects/${projectId}?linkedin_error=token_failed`);
      }

      // 2. DB에 저장
      const connection = await this.mediaService.createOrUpdate(userId, {
        projectId,
        platform: 'LINKEDIN' as any,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      });

      // 3. 토큰 만료 시간 저장
      if (tokenData.expires_in) {
        const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
        connection.tokenExpiresAt = expiresAt;
        await this.mediaService['mediaConnectionRepository'].save(connection);
      }

      // 성공 시 프론트엔드로 redirect
      return res.redirect(`${frontendUrl}/projects/${projectId}?linkedin_success=true`);
    } catch (error) {
      console.error('❌ LinkedIn OAuth 콜백 오류:', error);
      // 오류 시 프론트엔드로 redirect with error
      return res.redirect(`${frontendUrl}/projects?linkedin_error=unknown`);
    }
  }

  @Post('linkedin/refresh')
  @ApiOperation({ summary: 'LinkedIn Access Token 갱신' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string', description: 'Media Connection ID' },
      },
      required: ['connectionId'],
    },
  })
  async refreshLinkedInToken(
    @Body('connectionId') connectionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<{ success: boolean; message: string }> {
    // 1. Connection 조회
    const connection = await this.mediaService.findOne(connectionId, user.userId);
    
    if (!connection.refreshToken) {
      return {
        success: false,
        message: 'Refresh Token이 없습니다.',
      };
    }

    // 2. Token 갱신
    const tokenData = await this.linkedinService.refreshAccessToken(connection.refreshToken);
    
    if (!tokenData) {
      return {
        success: false,
        message: 'Token 갱신 실패',
      };
    }

    // 3. DB 업데이트
    connection.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) {
      connection.refreshToken = tokenData.refresh_token;
    }
    if (tokenData.expires_in) {
      connection.tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    }
    await this.mediaService['mediaConnectionRepository'].save(connection);

    return {
      success: true,
      message: 'Token 갱신 성공',
    };
  }
}
