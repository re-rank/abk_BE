import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
} from "class-validator";
import { SiteType } from "../../database/entities/authority-site.entity";

export class CreateAuthoritySiteDto {
  @ApiProperty({ description: "사이트 이름" })
  @IsString()
  siteName: string;

  @ApiProperty({ description: "사이트 URL" })
  @IsString()
  siteUrl: string;

  @ApiPropertyOptional({ description: "설명" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SiteType, default: SiteType.CUSTOM })
  @IsOptional()
  @IsEnum(SiteType)
  siteType?: SiteType;

  @ApiPropertyOptional({ description: "로그인 페이지 URL" })
  @IsOptional()
  @IsString()
  loginUrl?: string;

  @ApiPropertyOptional({ description: "로그인 아이디 입력 셀렉터" })
  @IsOptional()
  @IsString()
  loginUsernameSelector?: string;

  @ApiPropertyOptional({ description: "로그인 비밀번호 입력 셀렉터" })
  @IsOptional()
  @IsString()
  loginPasswordSelector?: string;

  @ApiPropertyOptional({ description: "로그인 제출 버튼 셀렉터" })
  @IsOptional()
  @IsString()
  loginSubmitSelector?: string;

  @ApiPropertyOptional({ description: "로그인 아이디" })
  @IsOptional()
  @IsString()
  loginUsername?: string;

  @ApiPropertyOptional({ description: "로그인 비밀번호" })
  @IsOptional()
  @IsString()
  loginPassword?: string;

  @ApiPropertyOptional({ description: "글쓰기 페이지 URL" })
  @IsOptional()
  @IsString()
  writeUrl?: string;

  @ApiPropertyOptional({ description: "제목 입력 셀렉터" })
  @IsOptional()
  @IsString()
  titleSelector?: string;

  @ApiPropertyOptional({ description: "본문 입력 셀렉터" })
  @IsOptional()
  @IsString()
  bodySelector?: string;

  @ApiPropertyOptional({ description: "등록 버튼 셀렉터" })
  @IsOptional()
  @IsString()
  submitSelector?: string;

  @ApiPropertyOptional({ description: "세션 쿠키 (JSON)" })
  @IsOptional()
  @IsString()
  sessionCookies?: string;

  @ApiPropertyOptional({ description: "활성화 여부", default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "우선순위", default: 0 })
  @IsOptional()
  @IsNumber()
  priority?: number;
}
