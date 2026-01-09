import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BacklinksService } from './backlinks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('Backlinks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('backlinks')
export class BacklinksController {
  constructor(private readonly backlinksService: BacklinksService) {}

  @Get()
  @ApiOperation({ summary: '프로젝트별 백링크 목록 조회' })
  findAll(
    @Query('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.backlinksService.findAllByProject(projectId, user.userId);
  }

  @Get('stats')
  @ApiOperation({ summary: '백링크 통계 조회' })
  getStats(@Query('projectId') projectId: string) {
    return this.backlinksService.getBacklinkStats(projectId);
  }
}

