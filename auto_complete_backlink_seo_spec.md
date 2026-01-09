
# 자동완성 검색 유도 + 백링크 SEO 통합 솔루션
## 개발자 전달용 통합 개발 명세서 (Spec v1.1)

---

## 1. 프로젝트 개요

### 1.1 목적
본 프로젝트는 전문직 및 퍼스널 브랜드 사용자를 대상으로,
콘텐츠 자동 생성 → 발행 → 확산 → 검색 유도 → 백링크 축적의 전 과정을 자동화하는 SaaS를 개발하는 것을 목표로 한다.

### 1.2 핵심 원칙
- 자동완성 결과 직접 조작 금지
- 검색엔진 정책 위반 가능 기능 배제
- 콘텐츠 기반 합법적 SEO 전략만 채택

---

## 2. 시스템 아키텍처

Frontend (React + Vite + TS)
 → REST API
Backend (NestJS)
 → DB (Supabase PostgreSQL)
 → Queue (BullMQ + Upstash)
 → Headless Browser (Playwright)

---

## 3. 기술 스택

### Frontend
- React, Vite, TypeScript

### Backend
- NestJS (REST API)
- Playwright (Medium 자동 발행)

### Database
- neon

### Infra
- BullMQ, Upstash Redis

---

## 4. 사용자 역할

### USER
- 프로젝트 생성
- 콘텐츠 생성/발행
- 성과 대시보드 확인

### ADMIN
- Authority Site 관리
- 백링크 승인
- 전체 프로젝트 모니터링

---

## 5. 데이터베이스 설계

### User
```sql
User(
  id UUID PK,
  email VARCHAR,
  password_hash VARCHAR,
  role ENUM('USER','ADMIN'),
  created_at TIMESTAMP
)
```

### Project
```sql
Project(
  id UUID PK,
  user_id UUID FK,
  project_name VARCHAR,
  brand_name VARCHAR,
  main_keyword VARCHAR,
  target_url VARCHAR,
  created_at TIMESTAMP
)
```

### Content
```sql
Content(
  id UUID PK,
  project_id UUID FK,
  title VARCHAR,
  body TEXT,
  content_type ENUM('INFO','CASE','GUIDE'),
  search_cta TEXT,
  status ENUM('CREATED','PUBLISHED','FAILED'),
  created_at TIMESTAMP
)
```

### Backlink
```sql
Backlink(
  id UUID PK,
  content_id UUID FK,
  project_id UUID FK,
  source_type ENUM('SELF','AUTHORITY','INTERNAL'),
  source_platform ENUM('WORDPRESS','MEDIUM'),
  source_url VARCHAR,
  target_url VARCHAR,
  anchor_text VARCHAR,
  is_follow BOOLEAN,
  inserted_position ENUM('MID','BOTTOM'),
  created_at TIMESTAMP
)
```

---

## 6. 콘텐츠 생성 명세

- 길이: 800~1500자
- 유형: INFO / CASE / GUIDE
- 필수 포함:
  - 전문 키워드 반복
  - 검색 유도 CTA
    > "자세한 내용은 구글에서 '{전문키워드} {브랜드명}'을 검색해보시기 바랍니다."

---

## 7. 백링크 시스템 (중요)

### 7.1 백링크 유형
- SELF: 자기 콘텐츠 → 자기 URL
- AUTHORITY: 선발 사이트 → 후발 사이트 (Phase 2)
- INTERNAL: 프로젝트 내 콘텐츠 간 연결

### 7.2 삽입 규칙
- 콘텐츠당 1~2개
- 첫 문단 삽입 금지
- 위치 랜덤화 (중단/하단)

### 7.3 앵커 텍스트 로직
- 브랜드명
- 전문키워드 + 브랜드명
- 일반 정보성 문구
- 동일 앵커 연속 사용 금지

---

## 8. 발행 엔진

### WordPress
- REST API
- Application Password 인증

### Medium
- https://github.com/Medium/medium-api-docs
- API 연동하여 작업업

---

## 9. SNS 확산

- X, LinkedIn
- 콘텐츠 요약 + 링크
- 브랜드명 포함 필수

---

## 10. 스케줄링

- 주 2~3회
- 랜덤 시간 분산
- Queue 기반 순차 처리

---

## 11. 대시보드

- 콘텐츠 발행 수
- 플랫폼별 발행 현황
- 백링크 수 및 유형 분포
- 앵커 텍스트 분산도

---

## 12. API 예시

### 콘텐츠 생성
POST /api/content/generate

### 콘텐츠 발행
POST /api/content/publish

### 백링크 조회
GET /api/backlinks?projectId=UUID

---

## 13. 금지 기능

- 검색 자동 실행
- 트래픽/봇 생성
- 다계정 운영
- 프록시/IP 조작
- 자동완성 직접 제어

---

## 14. MVP 범위

포함:
- 프로젝트 생성
- 콘텐츠 생성
- WordPress 발행
- SELF 백링크
- 대시보드

제외:
- Authority 백링크
- 고급 SEO 분석

---

## 15. 핵심 요약

본 시스템은 불법 SEO 없이,
콘텐츠 발행 과정 자체에서
검색 행동과 백링크가 자연스럽게 발생하도록 설계된 자동화 SaaS이다.
