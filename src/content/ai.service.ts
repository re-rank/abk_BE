import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ContentType } from '../database/entities/content.entity';

interface GenerateContentParams {
  brandName: string;
  mainKeyword: string;
  contentType: ContentType;
  topic?: string;
  targetUrl?: string; // 백링크 삽입용 타겟 URL
}

interface GeneratedContent {
  title: string;
  body: string;
  searchCta: string;
}

@Injectable()
export class AiService {
  private anthropic: Anthropic;

  constructor(private configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get('ANTHROPIC_API_KEY'),
    });
  }

  async generateContent(params: GenerateContentParams): Promise<GeneratedContent> {
    const { brandName, mainKeyword, contentType, topic, targetUrl } = params;

    const prompt = this.buildPrompt(brandName, mainKeyword, contentType, topic);

    // 사용 가능한 모델 시도 순서:
    // 1. claude-3-haiku-20240307 (가장 저렴하고 빠름)
    // 2. claude-3-sonnet-20240229
    // 3. claude-3-opus-20240229 (가장 강력)
    const message = await this.anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    return this.parseResponse(responseText, brandName, mainKeyword, targetUrl);
  }

  private buildPrompt(
    brandName: string,
    mainKeyword: string,
    contentType: ContentType,
    topic?: string,
  ): string {
    const typeDescription = {
      [ContentType.INFO]: '정보성 콘텐츠 - 해당 분야의 유용한 정보를 제공',
      [ContentType.CASE]: '사례 콘텐츠 - 성공 사례나 경험담을 공유',
      [ContentType.GUIDE]: '가이드 콘텐츠 - 단계별 안내나 방법을 설명',
    };

    return `당신은 SEO 전문 콘텐츠 작성자입니다. 다음 조건에 맞는 블로그 콘텐츠를 작성해주세요.

## 작성 조건
- 브랜드명: ${brandName}
- 메인 키워드: ${mainKeyword}
- 콘텐츠 유형: ${typeDescription[contentType]}
${topic ? `- 주제: ${topic}` : ''}

## 작성 규칙
1. 본문 길이: 800~1500자 (공백 포함)
2. 전문 키워드 "${mainKeyword}"를 자연스럽게 3~5회 반복
3. 전문적이고 신뢰감 있는 톤 유지
4. 읽기 쉬운 문단 구성

## 출력 형식 (반드시 이 형식을 따라주세요)
[TITLE]
(여기에 제목 작성)
[/TITLE]

[BODY]
(여기에 본문 작성)
[/BODY]

제목과 본문만 작성해주세요. 다른 설명은 필요 없습니다.`;
  }

  private parseResponse(
    response: string,
    brandName: string,
    mainKeyword: string,
    targetUrl?: string,
  ): GeneratedContent {
    const titleMatch = response.match(/\[TITLE\]([\s\S]*?)\[\/TITLE\]/);
    const bodyMatch = response.match(/\[BODY\]([\s\S]*?)\[\/BODY\]/);

    const title = titleMatch ? titleMatch[1].trim() : '제목 없음';
    let body = bodyMatch ? bodyMatch[1].trim() : response;

    // 백링크 삽입 (타겟 URL이 있는 경우)
    if (targetUrl) {
      body = this.insertBacklink(body, brandName, mainKeyword, targetUrl);
    }

    // 검색 유도 CTA 생성
    const searchCta = `자세한 내용은 구글에서 '${mainKeyword} ${brandName}'을 검색해보시기 바랍니다.`;

    // CTA를 본문 마지막에 추가
    body = `${body}\n\n${searchCta}`;

    return {
      title,
      body,
      searchCta,
    };
  }

  /**
   * 본문에 백링크를 자연스럽게 삽입
   */
  private insertBacklink(
    body: string,
    brandName: string,
    mainKeyword: string,
    targetUrl: string,
  ): string {
    const paragraphs = body.split('\n\n');
    
    if (paragraphs.length < 2) {
      // 문단이 적으면 끝에 추가
      const anchorText = this.generateAnchorText(brandName, mainKeyword);
      return `${body}\n\n<a href="${targetUrl}">${anchorText}</a>`;
    }

    // 앵커 텍스트 랜덤 선택
    const anchorText = this.generateAnchorText(brandName, mainKeyword);
    const link = `<a href="${targetUrl}">${anchorText}</a>`;

    // 중간 또는 마지막 문단에 삽입 (랜덤)
    const insertAtMiddle = Math.random() > 0.5;
    
    if (insertAtMiddle && paragraphs.length >= 3) {
      // 중간에 삽입 (첫 문단과 마지막 문단 제외)
      const midIndex = Math.floor(paragraphs.length / 2);
      paragraphs[midIndex] = `${paragraphs[midIndex]} ${link}`;
    } else {
      // 마지막 문단에 삽입
      paragraphs[paragraphs.length - 1] = `${paragraphs[paragraphs.length - 1]} ${link}`;
    }

    return paragraphs.join('\n\n');
  }

  /**
   * 다양한 앵커 텍스트 생성 (SEO 자연스러움을 위해)
   */
  private generateAnchorText(brandName: string, mainKeyword: string): string {
    const types = [
      brandName, // 브랜드명만
      `${mainKeyword} ${brandName}`, // 키워드 + 브랜드명
      '자세히 보기',
      '더 알아보기',
      '관련 정보 확인',
      `${brandName} 상담`,
      `${mainKeyword} 전문`,
    ];
    
    return types[Math.floor(Math.random() * types.length)];
  }
}

