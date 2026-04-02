import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  name?: string;
}

@Injectable()
export class JwtAuthGuard {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
      throw new UnauthorizedException('인증 토큰이 필요합니다.');
    }

    const token = authHeader.substring(7);

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      request.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      };

      return true;
    } catch {
      throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    }
  }
}
