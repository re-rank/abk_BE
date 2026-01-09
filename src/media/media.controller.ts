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
import { LinkedinService } from '../sns/linkedin.service';
import { createClient } from '@supabase/supabase-js';
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
    private readonly linkedinService: LinkedinService,
    private readonly configService: ConfigService,
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

  @Post('manual-login/open')
  @ApiOperation({ 
    summary: '수동 로그인 브라우저 열기',
    description: '2차 인증이 필요한 경우, 브라우저에서 직접 로그인할 수 있습니다. 로그인 완료 후 쿠키를 저장하세요.',
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
  openManualLoginBrowser(
    @Body('platform') platform: 'tistory' | 'naver',
  ) {
    return this.playwrightAuthService.openManualLoginBrowser(platform);
  }

  @Post('manual-login/save')
  @ApiOperation({ 
    summary: '수동 로그인 쿠키 저장',
    description: '브라우저에서 로그인 완료 후, 쿠키를 저장합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '세션 ID (openManualLoginBrowser에서 반환)' },
        projectId: { type: 'string', description: '프로젝트 ID' },
        platform: { type: 'string', enum: ['tistory', 'naver'], description: '플랫폼' },
      },
      required: ['sessionId', 'projectId', 'platform'],
    },
  })
  async saveManualLoginCookies(
    @Body('sessionId') sessionId: string,
    @Body('projectId') projectId: string,
    @Body('platform') platform: 'tistory' | 'naver',
    @CurrentUser() user: AuthUser,
  ): Promise<{
    success: boolean;
    message: string;
    accountInfo?: { name: string; url?: string; blogId?: string };
    connectionUpdated?: { success: boolean; message: string; connectionId?: string };
  }> {
    // 쿠키 추출
    const result = await this.playwrightAuthService.saveManualLoginCookies(sessionId);
    
    if (!result.success) {
      return result;
    }

    // 매체 연동 정보 저장/업데이트
    const platformMap = {
      tistory: 'TISTORY',
      naver: 'NAVER_BLOG',
    };

    const updateResult = await this.mediaService.updateCookies(
      projectId,
      platformMap[platform] as 'TISTORY' | 'NAVER_BLOG',
      result.cookies!,
      result.accountInfo,
      user.userId,
    );

    return {
      success: true,
      message: result.message,
      accountInfo: result.accountInfo,
      connectionUpdated: updateResult,
    };
  }

  @Post('manual-login/cancel')
  @ApiOperation({ summary: '수동 로그인 취소' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '세션 ID' },
      },
      required: ['sessionId'],
    },
  })
  async cancelManualLogin(@Body('sessionId') sessionId: string) {
    await this.playwrightAuthService.cancelManualLogin(sessionId);
    return { success: true, message: '수동 로그인이 취소되었습니다.' };
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
    
    // 토큰 검증을 위해 Supabase에서 사용자 정보 조회
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    
    // 디버깅 로그
    console.log('🔍 SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음');
    console.log('🔍 SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '설정됨 (길이: ' + supabaseServiceKey.length + ')' : '없음');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase 환경변수가 설정되지 않았습니다.');
      console.error('현재 .env 경로:', process.cwd());
      return res.redirect(`${frontendUrl}/login?error=config_error`);
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('🔍 토큰 길이:', token ? token.length : 'token 없음');
    
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('❌ Supabase 토큰 검증 실패:', error?.message || 'user가 null');
      console.error('❌ 에러 상세:', JSON.stringify(error, null, 2));
      return res.redirect(`${frontendUrl}/login?error=unauthorized`);
    }
    
    console.log('✅ 토큰 검증 성공, userId:', user.id);
    
    // DB에서 프로젝트의 LinkedIn 연동 정보 가져오기
    const linkedinConnection = await this.mediaService.findByProjectAndPlatform(
      projectId,
      MediaPlatform.LINKEDIN,
      user.id,
    );
    
    if (!linkedinConnection?.clientId) {
      console.error('❌ LinkedIn Client ID가 설정되지 않았습니다.');
      return res.redirect(`${frontendUrl}/projects/${projectId}?linkedin_error=no_client_id`);
    }
    
    console.log('✅ LinkedIn Client ID 확인됨');
    
    // state에 userId와 projectId를 JSON으로 인코딩
    const state = Buffer.from(JSON.stringify({ 
      userId: user.id, 
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
