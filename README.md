# ABK SEO Solution - Backend

자동완성 검색 유도 + 백링크 SEO 통합 솔루션의 백엔드 서버입니다.

## 기술 스택

- **Framework**: NestJS
- **Database**: Supabase PostgreSQL (TypeORM)
- **Queue**: BullMQ + Upstash Redis
- **AI**: Anthropic Claude API
- **Authentication**: Supabase Auth (JWT)

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

`.env.example`을 참고하여 `.env` 파일을 생성하세요:

```bash
# Supabase - Database
SUPABASE_DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres

# Supabase - JWT Secret (Dashboard > Project Settings > Data API > JWT Secret)
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Redis - Upstash
REDIS_URL=redis://default:password@host:6379

# Anthropic Claude AI
ANTHROPIC_API_KEY=sk-ant-your-api-key

# WordPress (프로젝트별 설정 가능)
WORDPRESS_API_URL=https://your-site.com/wp-json/wp/v2
WORDPRESS_USERNAME=your-username
WORDPRESS_APP_PASSWORD=your-app-password

# Medium
MEDIUM_ACCESS_TOKEN=your-medium-access-token

# SNS
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret
TWITTER_ACCESS_TOKEN=your-twitter-access-token
TWITTER_ACCESS_SECRET=your-twitter-access-secret
LINKEDIN_ACCESS_TOKEN=your-linkedin-access-token

# App
PORT=3000
NODE_ENV=development
```

### Supabase JWT Secret 확인 방법

1. [Supabase Dashboard](https://supabase.com/dashboard) 접속
2. 프로젝트 선택
3. **Project Settings** (좌측 하단 톱니바퀴 아이콘)
4. **Data API** 메뉴 클릭
5. **JWT Secret** 항목에서 `Reveal` 클릭하여 복사
6. `.env` 파일의 `SUPABASE_JWT_SECRET`에 붙여넣기

### 3. 개발 서버 실행

```bash
npm run start:dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 4. API 문서

Swagger 문서: `http://localhost:3000/api/docs`

## API 엔드포인트

| Method | Endpoint | 설명 | 인증 |
|--------|----------|------|------|
| GET | /api/auth/profile | 내 프로필 조회 | 필요 |
| GET | /api/auth/verify | 토큰 검증 | 필요 |
| GET/POST | /api/projects | 프로젝트 CRUD | 필요 |
| POST | /api/content/generate | AI 콘텐츠 생성 | 필요 |
| POST | /api/content/publish | 콘텐츠 발행 | 필요 |
| GET | /api/backlinks | 백링크 조회 | 필요 |
| POST | /api/sns/share | SNS 공유 | 필요 |
| GET | /api/dashboard/stats | 대시보드 통계 | 필요 |

> **참고**: 회원가입/로그인은 프론트엔드에서 Supabase Auth를 직접 호출합니다.

## 프로젝트 구조

```
src/
├── auth/           # 인증 모듈 (Supabase JWT 검증)
├── projects/       # 프로젝트 관리
├── content/        # 콘텐츠 생성 (Claude AI)
├── backlinks/      # 백링크 시스템
├── publish/        # WordPress, Medium 발행
├── sns/            # SNS 확산 (X, LinkedIn)
├── queue/          # BullMQ 큐 처리
├── dashboard/      # 대시보드 통계
└── database/
    └── entities/   # TypeORM 엔티티
```

## 인증 시스템

이 백엔드는 **Supabase Auth**를 사용합니다:

1. 프론트엔드에서 Supabase Auth로 로그인/회원가입
2. Supabase가 JWT 토큰 발급
3. 프론트엔드가 API 요청 시 `Authorization: Bearer <token>` 헤더 포함
4. 백엔드가 JWT Secret으로 토큰 검증
5. 검증된 사용자 정보(`userId`, `email`)로 API 처리
