import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SnsService } from './sns.service';
import { ShareContentDto } from './dto/share-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('SNS')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sns')
export class SnsController {
  constructor(private readonly snsService: SnsService) {}

  @Post('share')
  @ApiOperation({ summary: 'SNS 공유' })
  share(
    @CurrentUser() user: AuthUser,
    @Body() shareDto: ShareContentDto,
  ) {
    return this.snsService.share(user.userId, shareDto);
  }

  @Get('posts/:contentId')
  @ApiOperation({ summary: 'SNS 발행 기록 조회' })
  getSnsPosts(@Param('contentId') contentId: string) {
    return this.snsService.getSnsPosts(contentId);
  }
}

