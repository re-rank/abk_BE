import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PublishService } from './publish.service';
import { PublishContentDto } from './dto/publish-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('Publish')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @Post('publish')
  @ApiOperation({ summary: '콘텐츠 발행' })
  publish(
    @CurrentUser() user: AuthUser,
    @Body() publishDto: PublishContentDto,
  ) {
    return this.publishService.publish(user.userId, publishDto);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: '발행 로그 조회' })
  getPublishLogs(@Param('id') contentId: string) {
    return this.publishService.getPublishLogs(contentId);
  }

  @Delete('logs/:logId')
  @ApiOperation({ summary: '발행 로그 삭제' })
  async deletePublishLog(
    @CurrentUser() user: AuthUser,
    @Param('logId') logId: string,
  ) {
    await this.publishService.deletePublishLog(logId, user.userId);
    return { success: true, message: '발행 기록이 삭제되었습니다.' };
  }
}

