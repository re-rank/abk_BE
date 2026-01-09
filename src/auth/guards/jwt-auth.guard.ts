import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface SupabaseJwtPayload extends JWTPayload {
  sub: string;
  aud: string;
  role: string;
  email: string;
  user_metadata?: {
    name?: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class JwtAuthGuard {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private supabaseUrl: string;

  constructor(
    private reflector: Reflector,
    private configService: ConfigService,
  ) {
    // SUPABASE_URL 또는 DB URL에서 추출
    let supabaseUrl = this.configService.get<string>('SUPABASE_URL') || '';

    if (!supabaseUrl) {
      const dbUrl = this.configService.get<string>('SUPABASE_DATABASE_URL') || '';
      const match = dbUrl.match(/db\.([a-z]+)\.supabase\.co/);
      if (match) {
        supabaseUrl = `https://${match[1]}.supabase.co`;
      }
    }

    this.supabaseUrl = supabaseUrl;

    if (supabaseUrl) {
      const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
      this.jwks = createRemoteJWKSet(new URL(jwksUrl));
      console.log('🔐 JwtAuthGuard initialized with JWKS from:', supabaseUrl);
    } else {
      console.warn('⚠️ SUPABASE_URL not configured. JWT verification will fail.');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Public 데코레이터 확인
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('❌ No Bearer token provided');
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    const token = authHeader.substring(7);

    if (!this.jwks) {
      console.log('❌ JWKS not configured');
      throw new UnauthorizedException('서버 인증 설정 오류');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `${this.supabaseUrl}/auth/v1`,
        audience: 'authenticated',
      });

      const supabasePayload = payload as SupabaseJwtPayload;

      console.log('🔐 JWT verified for user:', supabasePayload.email);

      // Supabase JWT payload 검증
      if (!supabasePayload.sub || !supabasePayload.email) {
        console.log('❌ Invalid token: missing sub or email');
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');
      }

      if (supabasePayload.role !== 'authenticated') {
        console.log('❌ User not authenticated, role:', supabasePayload.role);
        throw new UnauthorizedException('인증되지 않은 사용자입니다.');
      }

      // request.user에 사용자 정보 추가
      request.user = {
        userId: supabasePayload.sub,
        email: supabasePayload.email,
        role: supabasePayload.role,
        name: supabasePayload.user_metadata?.name,
      };

      console.log('✅ JWT validation successful for user:', supabasePayload.email);
      return true;
    } catch (error) {
      console.log('❌ JWT verification failed:', error);
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }
}
