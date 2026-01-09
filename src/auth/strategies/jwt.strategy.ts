import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Supabase JWT Payload 타입
interface SupabaseJwtPayload {
  sub: string; // Supabase user ID
  aud: string;
  role: string;
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
  user_metadata?: {
    name?: string;
    [key: string]: unknown;
  };
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private supabaseUrl: string;

  constructor(private configService: ConfigService) {
    // passport-jwt는 secretOrKeyProvider를 사용하여 비동기 키 검색 지원
    // SUPABASE_URL이 없으면 SUPABASE_DATABASE_URL에서 프로젝트 ID 추출
    let supabaseUrl = configService.get<string>('SUPABASE_URL') || '';
    
    if (!supabaseUrl) {
      const dbUrl = configService.get<string>('SUPABASE_DATABASE_URL') || '';
      console.log('🔍 Extracting project ID from DB URL:', dbUrl.substring(0, 50) + '...');
      // postgresql://postgres.[PROJECT_ID]:password@db.[PROJECT_ID].supabase.co 형태에서 프로젝트 ID 추출
      const match = dbUrl.match(/db\.([a-z]+)\.supabase\.co/);
      if (match) {
        supabaseUrl = `https://${match[1]}.supabase.co`;
        console.log('✅ Extracted Supabase URL:', supabaseUrl);
      } else {
        console.log('❌ Could not extract project ID from DB URL');
      }
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 비동기 키 검증을 위해 secretOrKeyProvider 사용
      secretOrKeyProvider: async (
        _request: unknown,
        rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void
      ) => {
        try {
          // JWKS를 사용하여 토큰 검증
          const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
          const JWKS = createRemoteJWKSet(new URL(jwksUrl));
          
          await jwtVerify(rawJwtToken, JWKS, {
            issuer: `${supabaseUrl}/auth/v1`,
            audience: 'authenticated',
          });
          
          // 검증 성공 시 더미 시크릿 반환 (이미 검증됨)
          done(null, 'verified');
        } catch (error) {
          console.log('❌ JWT verification failed:', error);
          done(error as Error);
        }
      },
    });

    this.supabaseUrl = supabaseUrl;
    console.log('🔐 JWT Strategy initialized with JWKS from:', supabaseUrl);
  }

  async validate(payload: SupabaseJwtPayload) {
    console.log('🔐 JWT validate called for user:', payload.email);
    
    // Supabase JWT payload 검증
    if (!payload.sub || !payload.email) {
      console.log('❌ Invalid token: missing sub or email');
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }

    // role이 authenticated인지 확인 (Supabase 인증된 사용자)
    if (payload.role !== 'authenticated') {
      console.log('❌ User not authenticated, role:', payload.role);
      throw new UnauthorizedException('인증되지 않은 사용자입니다.');
    }

    console.log('✅ JWT validation successful for user:', payload.email);
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      name: payload.user_metadata?.name,
    };
  }
}
