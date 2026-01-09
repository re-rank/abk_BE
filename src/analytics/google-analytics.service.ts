import { Injectable, Logger } from '@nestjs/common';

interface GAMetrics {
  activeUsers: number;
  sessions: number;
  pageViews: number;
  avgSessionDuration: number;
  bounceRate: number;
  newUsers: number;
}

interface GATrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
}

interface GAPageData {
  pagePath: string;
  pageViews: number;
  avgTimeOnPage: number;
}

interface GACredentials {
  client_email: string;
  private_key: string;
}

/**
 * Google Analytics 4 API 연동 서비스
 * 프로젝트별로 다른 서비스 계정을 사용
 * @see https://developers.google.com/analytics/devguides/reporting/data/v1
 */
@Injectable()
export class GoogleAnalyticsService {
  private readonly logger = new Logger(GoogleAnalyticsService.name);
  private readonly apiUrl = 'https://analyticsdata.googleapis.com/v1beta';
  
  // 프로젝트별 토큰 캐시
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  /**
   * 프로젝트별 액세스 토큰 획득
   */
  private async getAccessToken(credentialsJson: string): Promise<string | null> {
    const cacheKey = this.hashCredentials(credentialsJson);
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && cached.expiresAt > now) {
      return cached.token;
    }

    try {
      const credentials: GACredentials = JSON.parse(credentialsJson);
      
      // JWT 생성 및 토큰 요청
      const jwt = await this.createJWT(credentials);
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`토큰 획득 실패: ${error}`);
        return null;
      }

      const data = await response.json();
      const token = data.access_token;
      const expiresAt = now + (data.expires_in - 60) * 1000;
      
      // 캐시에 저장
      this.tokenCache.set(cacheKey, { token, expiresAt });

      return token;
    } catch (error) {
      this.logger.error(`토큰 획득 오류: ${error.message}`);
      return null;
    }
  }

  /**
   * 인증 정보 해시 (캐시 키용)
   */
  private hashCredentials(credentials: string): string {
    // 간단한 해시 - 실제로는 crypto.createHash 사용 권장
    return Buffer.from(credentials.slice(0, 100)).toString('base64');
  }

  /**
   * JWT 생성 (서비스 계정용)
   */
  private async createJWT(credentials: GACredentials): Promise<string> {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Node.js crypto를 사용한 서명
    const crypto = await import('crypto');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(credentials.private_key, 'base64url');

    return `${signatureInput}.${signature}`;
  }

  /**
   * 기본 메트릭 조회
   */
  async getMetrics(
    propertyId: string,
    credentialsJson: string,
    startDate: string,
    endDate: string,
  ): Promise<GAMetrics | null> {
    const token = await this.getAccessToken(credentialsJson);
    if (!token) {
      this.logger.warn('Google Analytics 인증 실패');
      return null;
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'sessions' },
              { name: 'screenPageViews' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'newUsers' },
            ],
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`GA 메트릭 조회 실패: ${error}`);
        return null;
      }

      const data = await response.json();
      const row = data.rows?.[0]?.metricValues;

      if (!row) {
        return null;
      }

      return {
        activeUsers: parseInt(row[0]?.value || '0', 10),
        sessions: parseInt(row[1]?.value || '0', 10),
        pageViews: parseInt(row[2]?.value || '0', 10),
        avgSessionDuration: parseFloat(row[3]?.value || '0'),
        bounceRate: parseFloat(row[4]?.value || '0'),
        newUsers: parseInt(row[5]?.value || '0', 10),
      };
    } catch (error) {
      this.logger.error(`GA API 오류: ${error.message}`);
      return null;
    }
  }

  /**
   * 트래픽 소스별 데이터 조회
   */
  async getTrafficSources(
    propertyId: string,
    credentialsJson: string,
    startDate: string,
    endDate: string,
  ): Promise<GATrafficSource[]> {
    const token = await this.getAccessToken(credentialsJson);
    if (!token) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [
              { name: 'sessionSource' },
              { name: 'sessionMedium' },
            ],
            metrics: [
              { name: 'sessions' },
              { name: 'activeUsers' },
            ],
            limit: 20,
          }),
        },
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
        source: row.dimensionValues[0]?.value || '',
        medium: row.dimensionValues[1]?.value || '',
        sessions: parseInt(row.metricValues[0]?.value || '0', 10),
        users: parseInt(row.metricValues[1]?.value || '0', 10),
      }));
    } catch (error) {
      this.logger.error(`트래픽 소스 조회 오류: ${error.message}`);
      return [];
    }
  }

  /**
   * 인기 페이지 조회
   */
  async getTopPages(
    propertyId: string,
    credentialsJson: string,
    startDate: string,
    endDate: string,
    limit: number = 10,
  ): Promise<GAPageData[]> {
    const token = await this.getAccessToken(credentialsJson);
    if (!token) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
              { name: 'screenPageViews' },
              { name: 'averageSessionDuration' },
            ],
            orderBys: [
              { metric: { metricName: 'screenPageViews' }, desc: true },
            ],
            limit,
          }),
        },
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => ({
        pagePath: row.dimensionValues[0]?.value || '',
        pageViews: parseInt(row.metricValues[0]?.value || '0', 10),
        avgTimeOnPage: parseFloat(row.metricValues[1]?.value || '0'),
      }));
    } catch (error) {
      this.logger.error(`인기 페이지 조회 오류: ${error.message}`);
      return [];
    }
  }

  /**
   * 일별 트래픽 데이터 조회
   */
  async getDailyTraffic(
    propertyId: string,
    credentialsJson: string,
    startDate: string,
    endDate: string,
  ): Promise<{ date: string; visitors: number; pageViews: number }[]> {
    const token = await this.getAccessToken(credentialsJson);
    if (!token) {
      return [];
    }

    try {
      const response = await fetch(
        `${this.apiUrl}/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: 'date' }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'screenPageViews' },
            ],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
          }),
        },
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.rows || []).map((row: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }) => {
        const dateStr = row.dimensionValues[0]?.value || '';
        return {
          date: `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`,
          visitors: parseInt(row.metricValues[0]?.value || '0', 10),
          pageViews: parseInt(row.metricValues[1]?.value || '0', 10),
        };
      });
    } catch (error) {
      this.logger.error(`일별 트래픽 조회 오류: ${error.message}`);
      return [];
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(
    propertyId: string,
    credentialsJson: string,
  ): Promise<{ success: boolean; message: string }> {
    const token = await this.getAccessToken(credentialsJson);
    if (!token) {
      return { success: false, message: '인증에 실패했습니다. 서비스 계정 JSON을 확인하세요.' };
    }

    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const metrics = await this.getMetrics(propertyId, credentialsJson, startDate, endDate);
      
      if (metrics) {
        return { success: true, message: `연결 성공! 최근 7일 방문자: ${metrics.activeUsers}명` };
      }
      
      return { success: false, message: 'GA 속성에 접근할 수 없습니다. Property ID와 권한을 확인하세요.' };
    } catch (error) {
      return { success: false, message: `연결 테스트 실패: ${error.message}` };
    }
  }
}
