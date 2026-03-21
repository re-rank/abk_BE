import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, ArrayMinSize } from 'class-validator';

export class PublishToSitesDto {
  @ApiProperty({ description: '등록할 사이트 ID 목록', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  siteIds: string[];

  @ApiProperty({ description: '글 제목' })
  @IsString()
  title: string;

  @ApiProperty({ description: '글 본문' })
  @IsString()
  body: string;
}
