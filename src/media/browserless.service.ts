import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext } from 'playwright';

interface BrowserlessSession {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  startTime: Date;
  platform: 'tistory' | 'naver';
  liveViewUrl: string;
}

interface StartSessionResult {
  success: boolean;
  sessionId?: string;
  liveViewUrl?: string;
  message: string;
}

interface SaveCookiesResult {
  success: boolean;
  cookies?: string;
  accountInfo?: {
    name: string;
    url?: string;
  };
  message: string;
}

@Injectable()
export class BrowserlessService {
  private readonly logger = new Logger(BrowserlessService.name);
  private sessions: Map<string, BrowserlessSession> = new Map();

  // 세션 타임아웃 (10분)
  private readonly SESSION_TIMEOUT = 10 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {
    // 주기적으로 만료된 세션 정리
    setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
  }

  /**
   * Browserless.io에 연결하여 원격 브라우저 세션 시작
   */
  async startSession(platform: 'tistory' | 'naver'): Promise<StartSessionResult> {
    const apiKey = this.configService.get<string>('BROWSERLESS_API_KEY');

    if (!apiKey) {
      this.logger.error('BROWSERLESS_API_KEY가 설정되지 않았습니다.');
      return {
        success: false,
        message: 'Browserless API Key가 설정되지 않았습니다. 환경변수를 확인해주세요.',
      };
    }

    try {
      // 고유 세션 ID 생성 (Browserless reconnect용)
      const sessionId = `abk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Browserless.io WebSocket 엔드포인트 (세션 ID 포함)
      const browserlessUrl = `wss://chrome.browserless.io?token=${apiKey}&trackingId=${sessionId}&--window-size=1280,800`;

      this.logger.log(`Browserless.io에 연결 중... (platform: ${platform}, sessionId: ${sessionId})`);

      // Playwright로 Browserless.io에 연결
      const browser = await chromium.connectOverCDP(browserlessUrl, {
        timeout: 30000,
      });

      // 새 컨텍스트 생성
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      // 새 페이지 생성 및 로그인 페이지로 이동
      const page = await context.newPage();

      const loginUrls = {
        tistory: 'https://www.tistory.com/auth/login',
        naver: 'https://nid.naver.com/nidlogin.login',
      };

      this.logger.log(`로그인 페이지로 이동 중: ${loginUrls[platform]}`);

      await page.goto(loginUrls[platform], {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      this.logger.log(`현재 URL: ${page.url()}`);

      // Browserless.io Live View URL - trackingId로 특정 세션 연결
      // 방법 1: debugger 엔드포인트 사용
      const liveViewUrl = `https://chrome.browserless.io/debugger?token=${apiKey}&trackingId=${sessionId}`;

      // 세션 저장
      const session: BrowserlessSession = {
        sessionId,
        browser,
        context,
        startTime: new Date(),
        platform,
        liveViewUrl,
      };

      this.sessions.set(sessionId, session);

      this.logger.log(`세션 시작 성공: ${sessionId}, liveViewUrl: ${liveViewUrl}`);

      return {
        success: true,
        sessionId,
        liveViewUrl,
        message: `${platform === 'tistory' ? '티스토리' : '네이버'} 로그인 페이지가 열렸습니다. 아래 브라우저에서 로그인을 완료해주세요.`,
      };
    } catch (error) {
      this.logger.error(`Browserless 세션 시작 실패: ${error.message}`);
      return {
        success: false,
        message: `원격 브라우저 연결 실패: ${error.message}`,
      };
    }
  }

  /**
   * 세션에서 쿠키 저장
   */
  async saveCookies(sessionId: string): Promise<SaveCookiesResult> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        success: false,
        message: '세션을 찾을 수 없습니다. 브라우저를 다시 열어주세요.',
      };
    }

    try {
      const { context, platform } = session;

      // 현재 페이지들의 쿠키 가져오기
      const cookies = await context.cookies();

      if (!cookies || cookies.length === 0) {
        return {
          success: false,
          message: '쿠키를 찾을 수 없습니다. 로그인이 완료되었는지 확인해주세요.',
        };
      }

      // 로그인 상태 확인
      const pages = context.pages();
      const page = pages[0];

      if (!page) {
        return {
          success: false,
          message: '브라우저 페이지를 찾을 수 없습니다.',
        };
      }

      const currentUrl = page.url();
      let isLoggedIn = false;
      let accountInfo: { name: string; url?: string } | undefined;

      if (platform === 'tistory') {
        // 티스토리 로그인 확인
        isLoggedIn = !currentUrl.includes('/auth/login') &&
                     (currentUrl.includes('tistory.com') || cookies.some(c => c.name === 'TSSESSION'));

        if (isLoggedIn) {
          // 블로그 정보 추출 시도
          try {
            const blogName = await page.evaluate(() => {
              const blogLink = document.querySelector('.blog_name, .tistory_logo a, .identity a');
              return blogLink?.textContent?.trim() || '';
            });

            if (blogName) {
              accountInfo = { name: blogName };
            }
          } catch {
            // 정보 추출 실패해도 계속 진행
          }
        }
      } else if (platform === 'naver') {
        // 네이버 로그인 확인
        isLoggedIn = !currentUrl.includes('nidlogin') &&
                     !currentUrl.includes('/login') &&
                     cookies.some(c => c.name === 'NID_AUT' || c.name === 'NID_SES');

        if (isLoggedIn) {
          // 네이버 계정 정보 추출 시도
          try {
            await page.goto('https://blog.naver.com', { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForTimeout(1000);

            const blogInfo = await page.evaluate(() => {
              const blogName = document.querySelector('.nick, .blog_name, .blog_title')?.textContent?.trim();
              const blogUrl = window.location.href;
              return { name: blogName || '', url: blogUrl };
            });

            if (blogInfo.name) {
              accountInfo = blogInfo;
            }
          } catch {
            // 정보 추출 실패해도 계속 진행
          }
        }
      }

      if (!isLoggedIn) {
        return {
          success: false,
          message: '로그인이 완료되지 않았습니다. 로그인을 완료한 후 다시 시도해주세요.',
        };
      }

      // 쿠키를 문자열로 변환
      const cookieString = cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      // 세션 정리
      await this.closeSession(sessionId);

      return {
        success: true,
        cookies: cookieString,
        accountInfo,
        message: '쿠키가 성공적으로 저장되었습니다.',
      };
    } catch (error) {
      this.logger.error(`쿠키 저장 실패: ${error.message}`);
      return {
        success: false,
        message: `쿠키 저장 중 오류: ${error.message}`,
      };
    }
  }

  /**
   * 세션 종료
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      try {
        await session.context.close();
        await session.browser.close();
      } catch (error) {
        this.logger.warn(`세션 종료 중 오류: ${error.message}`);
      }
      this.sessions.delete(sessionId);
      this.logger.log(`세션 종료: ${sessionId}`);
    }
  }

  /**
   * 세션 상태 확인
   */
  async getSessionStatus(sessionId: string): Promise<{
    active: boolean;
    url?: string;
    platform?: string;
  }> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return { active: false };
    }

    try {
      const pages = session.context.pages();
      const page = pages[0];

      return {
        active: true,
        url: page?.url(),
        platform: session.platform,
      };
    } catch {
      return { active: false };
    }
  }

  /**
   * 만료된 세션 정리
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.startTime.getTime() > this.SESSION_TIMEOUT) {
        this.logger.log(`만료된 세션 정리: ${sessionId}`);
        await this.closeSession(sessionId);
      }
    }
  }
}
