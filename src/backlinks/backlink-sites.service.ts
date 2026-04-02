import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { chromium, Browser, BrowserContext } from "playwright";
import * as fs from "fs";
import { execSync } from "child_process";
import {
  AuthoritySite,
  SiteType,
} from "../database/entities/authority-site.entity";
import {
  BacklinkPost,
  PostStatus,
} from "../database/entities/backlink-post.entity";
import { CreateAuthoritySiteDto } from "./dto/create-authority-site.dto";
import { UpdateAuthoritySiteDto } from "./dto/update-authority-site.dto";

@Injectable()
export class BacklinkSitesService {
  private readonly logger = new Logger(BacklinkSitesService.name);

  constructor(
    @InjectRepository(AuthoritySite)
    private readonly siteRepository: Repository<AuthoritySite>,
    @InjectRepository(BacklinkPost)
    private readonly postRepository: Repository<BacklinkPost>,
  ) {}

  // ── CRUD ──

  async findAll(userId: string): Promise<AuthoritySite[]> {
    return this.siteRepository.find({
      where: { userId },
      order: { priority: "DESC", createdAt: "DESC" },
    });
  }

  async create(
    userId: string,
    dto: CreateAuthoritySiteDto,
  ): Promise<AuthoritySite> {
    const site = this.siteRepository.create({ ...dto, userId });
    return this.siteRepository.save(site);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAuthoritySiteDto,
  ): Promise<AuthoritySite> {
    const site = await this.siteRepository.findOne({ where: { id, userId } });
    if (!site) throw new NotFoundException("사이트를 찾을 수 없습니다.");
    Object.assign(site, dto);
    return this.siteRepository.save(site);
  }

  async remove(id: string, userId: string): Promise<void> {
    const site = await this.siteRepository.findOne({ where: { id, userId } });
    if (!site) throw new NotFoundException("사이트를 찾을 수 없습니다.");
    await this.siteRepository.remove(site);
  }

  // ── 글 등록 이력 ──

  async findPosts(userId: string): Promise<BacklinkPost[]> {
    return this.postRepository.find({
      where: { userId },
      relations: ["authoritySite"],
      order: { createdAt: "DESC" },
    });
  }

  // ── Playwright 글 등록 ──

  async publishToSites(
    userId: string,
    siteIds: string[],
    title: string,
    body: string,
  ): Promise<BacklinkPost[]> {
    const sites = await this.siteRepository.find({
      where: { id: In(siteIds), userId },
    });

    if (sites.length === 0) {
      throw new NotFoundException("선택된 사이트를 찾을 수 없습니다.");
    }

    const results: BacklinkPost[] = [];

    for (const site of sites) {
      const post = this.postRepository.create({
        authoritySiteId: site.id,
        title,
        body,
        status: PostStatus.PENDING,
        userId,
      });

      try {
        const result = await this.publishToSingleSite(site, title, body);
        post.status = result.success ? PostStatus.SUCCESS : PostStatus.FAILED;
        post.publishedUrl = result.publishedUrl ?? undefined;
        post.errorMessage = result.error ?? undefined;
      } catch (err) {
        post.status = PostStatus.FAILED;
        post.errorMessage = err instanceof Error ? err.message : String(err);
      }

      results.push(await this.postRepository.save(post));
    }

    return results;
  }

  private async publishToSingleSite(
    site: AuthoritySite,
    title: string,
    body: string,
  ): Promise<{ success: boolean; publishedUrl?: string; error?: string }> {
    if (site.siteType === SiteType.WORDPRESS && site.wordpressApiUrl) {
      return this.publishViaWordPressApi(site, title, body);
    }
    if (site.siteType === SiteType.TISTORY) {
      return this.publishViaTistory(site, title, body);
    }
    return this.publishViaPlaywright(site, title, body);
  }

  // ── WordPress REST API 방식 ──

  private async publishViaWordPressApi(
    site: AuthoritySite,
    title: string,
    body: string,
  ): Promise<{ success: boolean; publishedUrl?: string; error?: string }> {
    try {
      const auth = Buffer.from(
        `${site.wordpressUsername}:${site.wordpressAppPassword}`,
      ).toString("base64");

      const response = await fetch(`${site.wordpressApiUrl}/wp/v2/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({ title, content: body, status: "publish" }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          error: `WordPress API 오류: ${response.status} ${errText}`,
        };
      }

      const data = await response.json();
      return { success: true, publishedUrl: data.link };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Playwright 범용 글 등록 ──

  private async publishViaPlaywright(
    site: AuthoritySite,
    title: string,
    body: string,
  ): Promise<{ success: boolean; publishedUrl?: string; error?: string }> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await this.createBrowser();
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
      });

      // 1. 세션 쿠키 복원
      if (site.sessionCookies) {
        const cookieArray = this.parseCookieString(
          site.sessionCookies,
          new URL(site.siteUrl).hostname,
        );
        await context.addCookies(cookieArray);
      }

      const page = await context.newPage();

      // 2. 로그인 필요시 로그인
      if (site.loginUrl && site.loginUsername && site.loginPassword) {
        await page.goto(site.loginUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        await page.waitForTimeout(2000);

        if (site.loginUsernameSelector) {
          await page.fill(site.loginUsernameSelector, site.loginUsername);
        }
        if (site.loginPasswordSelector) {
          await page.fill(site.loginPasswordSelector, site.loginPassword);
        }
        if (site.loginSubmitSelector) {
          await page.click(site.loginSubmitSelector);
          await page.waitForTimeout(3000);
        }

        // 로그인 후 쿠키 저장
        const cookies = await context.cookies();
        const updatedCookies = JSON.stringify(cookies);
        await this.siteRepository.update(site.id, {
          sessionCookies: updatedCookies,
        });
      }

      // 3. 글쓰기 페이지 이동
      if (!site.writeUrl) {
        return { success: false, error: "글쓰기 URL이 설정되지 않았습니다." };
      }

      await page.goto(site.writeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      // 4. 제목 입력
      if (site.titleSelector) {
        const titleEl = await page.$(site.titleSelector);
        if (titleEl) {
          const tagName = await titleEl.evaluate((el) =>
            el.tagName.toLowerCase(),
          );
          if (tagName === "input" || tagName === "textarea") {
            await titleEl.fill(title);
          } else {
            // contenteditable 등
            await titleEl.click();
            await page.keyboard.type(title);
          }
        } else {
          return {
            success: false,
            error: `제목 셀렉터를 찾을 수 없음: ${site.titleSelector}`,
          };
        }
      }

      // 5. 본문 입력
      if (site.bodySelector) {
        const bodyEl = await page.$(site.bodySelector);
        if (bodyEl) {
          const tagName = await bodyEl.evaluate((el) =>
            el.tagName.toLowerCase(),
          );
          if (tagName === "textarea") {
            await bodyEl.fill(body);
          } else if (tagName === "iframe") {
            // iframe 기반 에디터
            const frame = await bodyEl.contentFrame();
            if (frame) {
              const frameBody = await frame.$("body");
              if (frameBody) {
                await frameBody.click();
                await frame.evaluate((html) => {
                  document.body.innerHTML = html;
                }, body);
              }
            }
          } else {
            // contenteditable div 등
            await bodyEl.click();
            await bodyEl.evaluate((el, html) => {
              (el as HTMLElement).innerHTML = html;
            }, body);
          }
        } else {
          return {
            success: false,
            error: `본문 셀렉터를 찾을 수 없음: ${site.bodySelector}`,
          };
        }
      }

      // 6. 등록 버튼 클릭
      if (site.submitSelector) {
        await page.waitForTimeout(1000);
        await page.click(site.submitSelector);
        await page.waitForTimeout(5000);
      }

      // 7. 등록 후 URL 수집
      const currentUrl = page.url();

      return { success: true, publishedUrl: currentUrl };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      try {
        await context?.close();
      } catch {
        /* ignore */
      }
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
    }
  }

  // ── 티스토리 Playwright 글 등록 ──

  private async publishViaTistory(
    site: AuthoritySite,
    title: string,
    body: string,
  ): Promise<{ success: boolean; publishedUrl?: string; error?: string }> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      browser = await this.createBrowser();
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 900 },
      });

      // 1. 세션 쿠키 복원
      if (site.sessionCookies) {
        try {
          const cookies = JSON.parse(site.sessionCookies);
          await context.addCookies(cookies);
        } catch {
          this.logger.warn("티스토리 세션 쿠키 파싱 실패");
        }
      }

      const page = await context.newPage();

      // 2. 글쓰기 페이지 이동
      const writeUrl =
        site.writeUrl || `${site.siteUrl.replace(/\/$/, "")}/manage/newpost`;
      await page.goto(writeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      // 3. 로그인 필요 여부 확인 (카카오 로그인 페이지로 리다이렉트 체크)
      const currentUrl = page.url();
      const needsLogin =
        currentUrl.includes("accounts.kakao.com") ||
        currentUrl.includes("tistory.com/auth/login");

      if (needsLogin) {
        if (!site.loginUsername || !site.loginPassword) {
          return {
            success: false,
            error: "카카오 로그인 정보가 설정되지 않았습니다.",
          };
        }

        // 티스토리 로그인 페이지인 경우 카카오 로그인 버튼 클릭
        if (currentUrl.includes("tistory.com/auth/login")) {
          const kakaoBtn = await page.$(".btn_login.link_kakao_id");
          if (kakaoBtn) {
            await kakaoBtn.click();
            await page.waitForTimeout(3000);
          }
        }

        // 카카오 로그인 폼
        const emailInput = await page.$(
          'input[name="loginId"], input[name="loginKey"], #loginId--1',
        );
        if (emailInput) {
          await emailInput.click();
          await emailInput.fill(site.loginUsername);
        }

        const pwInput = await page.$('input[name="password"], #password--2');
        if (pwInput) {
          await pwInput.click();
          await pwInput.fill(site.loginPassword);
        }

        // 로그인 버튼 클릭
        const loginBtn = await page.$(
          'button[type="submit"], .btn_g.btn_confirm.submit',
        );
        if (loginBtn) {
          await loginBtn.click();
          await page.waitForTimeout(5000);
        }

        // 로그인 후 쿠키 저장
        const cookies = await context.cookies();
        await this.siteRepository.update(site.id, {
          sessionCookies: JSON.stringify(cookies),
        });

        // 글쓰기 페이지로 다시 이동
        const afterLoginUrl = page.url();
        if (!afterLoginUrl.includes("/manage/newpost")) {
          await page.goto(writeUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });
          await page.waitForTimeout(3000);
        }
      }

      // 4. 제목 입력 - 티스토리 에디터
      const titleInput = await page.$(
        '#post-title-inp, .tit_post input, input[placeholder*="제목"]',
      );
      if (titleInput) {
        await titleInput.click();
        await titleInput.fill(title);
      } else {
        return {
          success: false,
          error: "티스토리 제목 입력 필드를 찾을 수 없습니다.",
        };
      }

      await page.waitForTimeout(1000);

      // 5. 본문 입력 - 티스토리 에디터 (iframe 또는 contenteditable)
      let bodyInserted = false;

      // 방법 1: CodeMirror / contenteditable 기반 에디터
      const editorArea = await page.$(
        "#tinymce, .mce-content-body, #content, .editor-content",
      );
      if (editorArea) {
        await editorArea.click();
        await editorArea.evaluate((el, html) => {
          (el as HTMLElement).innerHTML = html;
        }, body);
        bodyInserted = true;
      }

      // 방법 2: iframe 기반 에디터
      if (!bodyInserted) {
        const iframe = await page.$("iframe#editor-tistory, iframe.editor");
        if (iframe) {
          const frame = await iframe.contentFrame();
          if (frame) {
            const frameBody = await frame.$("body");
            if (frameBody) {
              await frameBody.click();
              await frame.evaluate((html) => {
                document.body.innerHTML = html;
              }, body);
              bodyInserted = true;
            }
          }
        }
      }

      // 방법 3: 텍스트에어리어 (HTML 모드)
      if (!bodyInserted) {
        const textarea = await page.$(
          "textarea#content, textarea.editor-textarea",
        );
        if (textarea) {
          await textarea.fill(body);
          bodyInserted = true;
        }
      }

      if (!bodyInserted) {
        return {
          success: false,
          error: "티스토리 본문 에디터를 찾을 수 없습니다.",
        };
      }

      await page.waitForTimeout(1000);

      // 6. 발행 버튼 클릭
      // 먼저 "완료" 또는 "발행" 버튼 찾기
      const publishBtn = await page.$(
        '#publish-layer-btn, button.btn_publish, .btn_save, button[data-name="publish"]',
      );
      if (publishBtn) {
        await publishBtn.click();
        await page.waitForTimeout(2000);

        // 발행 확인 레이어가 뜨는 경우 (공개 발행 확인 버튼)
        const confirmBtn = await page.$(
          "#publish-btn, .btn_ok, button.btn_default",
        );
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(5000);
        }
      } else {
        return {
          success: false,
          error: "티스토리 발행 버튼을 찾을 수 없습니다.",
        };
      }

      // 7. 발행 후 쿠키 저장
      const finalCookies = await context.cookies();
      await this.siteRepository.update(site.id, {
        sessionCookies: JSON.stringify(finalCookies),
      });

      // 8. 발행된 URL 수집
      const publishedUrl = page.url();

      return { success: true, publishedUrl };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      try {
        await context?.close();
      } catch {
        /* ignore */
      }
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
    }
  }

  // ── 유틸리티 ──

  private async createBrowser(): Promise<Browser> {
    let execPath: string | undefined = undefined;

    if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
      execPath = process.env.CHROMIUM_PATH;
    }

    if (!execPath) {
      try {
        const systemChromium = execSync(
          "which chromium || which chromium-browser || which google-chrome",
          { encoding: "utf-8" },
        ).trim();
        if (systemChromium && fs.existsSync(systemChromium)) {
          execPath = systemChromium;
        }
      } catch {
        // not found
      }
    }

    return chromium.launch({
      headless: true,
      executablePath: execPath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--no-first-run",
      ],
    });
  }

  private parseCookieString(
    cookies: string,
    domain: string,
  ): Array<{ name: string; value: string; domain: string; path: string }> {
    const trimmed = cookies.trim();

    if (trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed);
      } catch {
        this.logger.warn("쿠키 JSON 파싱 실패, 문자열 형식으로 시도");
      }
    }

    return trimmed
      .split(";")
      .map((pair) => pair.trim())
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const [name, ...rest] = pair.split("=");
        return {
          name: name.trim(),
          value: rest.join("=").trim(),
          domain,
          path: "/",
        };
      });
  }
}
