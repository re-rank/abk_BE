import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  name?: string;
}

@Controller('auth')
export class AuthController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.userId,
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }

  @Get('verify')
  @UseGuards(JwtAuthGuard)
  verifyToken(@CurrentUser() user: AuthenticatedUser) {
    return {
      valid: true,
      userId: user.userId,
      email: user.email,
    };
  }
}
