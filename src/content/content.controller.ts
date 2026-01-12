import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { GenerateContentDto } from './dto/generate-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { ScheduleContentDto, CancelScheduleDto } from './dto/schedule-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

@ApiTags('Content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @ApiOperation({ summary: '콘텐츠 직접 생성 (수동 업로드)' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() createContentDto: CreateContentDto,
  ) {
    return this.contentService.create(user.userId, createContentDto);
  }

  @Post('generate')
  @ApiOperation({ summary: '콘텐츠 생성 (AI)' })
  generate(
    @CurrentUser() user: AuthUser,
    @Body() generateContentDto: GenerateContentDto,
  ) {
    return this.contentService.generate(user.userId, generateContentDto);
  }

  @Get()
  @ApiOperation({ summary: '프로젝트별 콘텐츠 목록 조회' })
  findAll(
    @Query('projectId') projectId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.findAllByProject(projectId, user.userId);
  }

  @Get('scheduled')
  @ApiOperation({ summary: '예약된 콘텐츠 목록 조회' })
  findScheduled(@CurrentUser() user: AuthUser) {
    return this.contentService.findScheduledContents(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '콘텐츠 상세 조회' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.findOne(id, user.userId);
  }

  @Get(':id/publish-status')
  @ApiOperation({ summary: '콘텐츠 발행 상태 조회' })
  getPublishStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.getPublishStatus(id, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '콘텐츠 수정' })
  update(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.update(id, user.userId, updateContentDto);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: '콘텐츠 예약 발행 설정' })
  schedulePublish(
    @Param('id') id: string,
    @Body() scheduleDto: ScheduleContentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.schedulePublish(id, user.userId, scheduleDto);
  }

  @Post(':id/cancel-schedule')
  @ApiOperation({ summary: '예약 발행 취소' })
  cancelSchedule(
    @Param('id') id: string,
    @Body() cancelDto: CancelScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.cancelSchedule(id, user.userId, cancelDto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: '콘텐츠 삭제' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contentService.remove(id, user.userId);
  }
}
