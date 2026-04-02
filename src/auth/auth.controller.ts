import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  name?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.userId);
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
