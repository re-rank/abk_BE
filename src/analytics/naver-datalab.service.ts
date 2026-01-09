import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SearchTrendResult {
  title: string;
  keywords: string[];
  data: {
    period: string;
    ratio: number;
  }[];
}

interface RelatedKeyword {
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  monthlyAvePcClkCnt: number;
  monthlyAveMobileClkCnt: number;
  monthlyAvePcCtr: number;
  monthlyAveMobileCtr: number;
  plAvgDepth: number;
  compIdx: string;
}

/**
 * 네이버 데이터랩 API 연동 서비스
 * @see https://developers.naver.com/docs/serviceapi/datalab/search/search.md
 */
@Injectable()
export class NaverDataLabService {
  private readonly logger = new Logger(NaverDataLabService.name);
  private readonly searchTrendUrl = 'https://openapi.naver.com/v1/datalab/search';
  private readonly shoppingInsightUrl = 'https://openapi.naver.com/v1/datalab/shopping/categories';

  constructor(private configService: ConfigService) {}

  /**
   * API 사용 가능 여부 확인
   */
  isAvailable(): boolean {
    const clientId = this.configService.get<string>('NAVER_CLIENT_ID');
    const clientSecret = this.configService.get<string>('NAVER_CLIENT_SECRET');
    return !!(clientId && clientSecret);
  }

  /**
   * 검색어 트렌드 조회
   * 최대 5개 그룹, 각 그룹당 최대 20개 키워드
   */
  async getSearchTrend(
    keywords: string[],
    startDate: string, // YYYY-MM-DD
    endDate: string,
    timeUnit: 'date' | 'week' | 'month' = 'week',
  ): Promise<SearchTrendResult[]> {
    if (!this.isAvailable()) {
      this.logger.warn('네이버 API 인증 정보가 설정되지 않았습니다.');
      return [];
    }

    try {
      // 키워드를 그룹으로 구성 (각 키워드를 별도 그룹으로)
      const keywordGroups = keywords.slice(0, 5).map((keyword) => ({
        groupName: keyword,
        keywords: [keyword],
      }));

      const requestBody = {
        startDate,
        endDate,
        timeUnit,
        keywordGroups,
      };

      const response = await fetch(this.searchTrendUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`검색어 트렌드 조회 실패: ${error}`);
        return [];
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      this.logger.error(`검색어 트렌드 API 오류: ${error.message}`);
      return [];
    }
  }

  /**
   * 키워드 검색량 비교 (상대적 비율)
   */
  async compareKeywordTrends(
    keywords: string[],
    days: number = 30,
  ): Promise<{ keyword: string; avgRatio: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    const results = await this.getSearchTrend(
      keywords,
      this.formatDate(startDate),
      this.formatDate(endDate),
      'date',
    );

    return results.map((r) => ({
      keyword: r.title,
      avgRatio:
        r.data.length > 0
          ? r.data.reduce((sum, d) => sum + d.ratio, 0) / r.data.length
          : 0,
    }));
  }

  /**
   * 관련 키워드 조회 (검색 광고 API 필요)
   * 주의: 이 기능은 네이버 검색광고 API를 사용해야 합니다.
   * @see https://developers.naver.com/docs/searchad/keywordapi/
   */
  async getRelatedKeywords(keyword: string): Promise<RelatedKeyword[]> {
    // 네이버 검색광고 API는 별도 인증 필요
    // 현재는 미구현 상태
    this.logger.debug(`관련 키워드 조회 요청: ${keyword}`);
    return [];
  }

  /**
   * 월간 검색량 추정
   * 데이터랩 API로는 정확한 검색량을 알 수 없어
   * 상대적 비율을 기반으로 추정값 반환
   */
  async estimateMonthlySearchVolume(keyword: string): Promise<number> {
    const trends = await this.compareKeywordTrends([keyword], 30);
    
    if (trends.length === 0 || trends[0].avgRatio === 0) {
      return 0;
    }

    // 비율 기반 추정 (실제 검색량이 아닌 상대적 지표)
    // 100을 기준으로 하여 추정치 계산
    const baseVolume = 10000; // 가정: 평균 키워드 월간 검색량
    return Math.round(baseVolume * (trends[0].avgRatio / 50));
  }

  /**
   * HTTP 요청 헤더 생성
   */
  private getHeaders(): Record<string, string> {
    return {
      'X-Naver-Client-Id': this.configService.get<string>('NAVER_CLIENT_ID') || '',
      'X-Naver-Client-Secret': this.configService.get<string>('NAVER_CLIENT_SECRET') || '',
      'Content-Type': 'application/json',
    };
  }

  /**
   * 날짜 포맷팅 (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

