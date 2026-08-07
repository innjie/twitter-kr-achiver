# 프로젝트: 트위터 다국어 아카이빙 도구

## 개요
X(트위터)의 한국어 검색 문제를 해결하기 위해 개인 트윗/북마크를
셀프호스팅 방식으로 아카이빙하고, 한/영/일/중 다국어 검색이 가능한 도구.

## 아키텍처 원칙
- 완전 셀프호스팅: 사용자가 직접 X API 키, DB, 검색엔진을 설치/운영
- DB: SQLite 기본, Postgres 선택 가능 (어댑터 패턴, .env의 DB_TYPE으로 전환)
- 검색엔진: Meilisearch 기본, Elasticsearch+Nori/Kuromoji/SmartCN 선택 가능 (어댑터 패턴, .env의 SEARCH_ENGINE으로 전환)
- 다국어 지원: 한/영/일/중 (트윗 lang 필드 기준 언어별 처리/매핑)
- 고급 검색: from/since/until/lang/is 등 X 스타일 문법을 앱 레벨 쿼리 파서가 필터로 변환 (검색엔진은 필터링만 담당)
- X API: OAuth 2.0 + PKCE, BYOK(각자 API 키 사용)
- 데이터 수집: 최초 1회 X 공식 아카이브(zip)로 전체 이력 임포트(스트리밍 파싱+배치 insert+bulk 인덱싱) → 이후 API 폴링(since_id 기준, 5~15분 간격)으로 신규분만 수집

## 보안 필수 사항
- 검색엔진은 인증 설정(마스터키/비밀번호) 없이는 실행되지 않도록 검증 코드 필수
- OAuth 토큰은 반드시 암호화 저장, state 파라미터 검증 필수
- 서버 모드에서 공인 노출(도메인/Cloudflare Tunnel)일 경우 Basic Auth 또는 앱 로그인 없이는 실행 차단, Tailscale 등 사설 네트워크 전용 노출이면 선택(on/off 가능)
- 검색엔진 포트는 기본적으로 127.0.0.1에만 바인딩, 외부 노출 금지
- .env, DB 파일 등 민감 파일은 커밋/외부 노출 금지 (pre-commit 시크릿 스캔 포함)
- 보안 점검 이력은 `claude/rules/backend.md` 참고

## 컨벤션
- 커밋 메시지는 한국어로 작성
  - 새 기능인 경우: `[add] "진행한 작업 내용"`
  - 기존 기능을 수정하거나 추가 작업한 경우: `[update] "진행한 작업 내용"`
  - 기존 기능을 삭제하는 경우: `[delete] "진행한 작업 내용"`
- 새 기능 추가 전 항상 계획을 먼저 설명하고 승인받은 뒤 구현
- 파일 삭제, DB 스키마 변경 등 되돌리기 어려운 작업은 항상 먼저 확인받기
- 프론트엔드에서 X 로고/브랜드명/브랜드 컬러를 그대로 복제하지 않음 (UX 패턴만 참고, 독자 브랜드 요소 사용)

## 프론트엔드
세부 화면 스펙/구조/컴포넌트/결정 히스토리는 `claude/rules/frontend.md` 참고 (docs/06_개발가이드.md §10 기준).

## 백엔드
API/DB/검색엔진/폴링 관련 결정 히스토리는 `claude/rules/backend.md` 참고.

## 코드 스타일
공통 코드 규칙(secure-coding, 네이밍, 모듈화 등)은 `claude/rules/code-style.md` 참고.

## 참고 문서
- docs/06_개발가이드.md (아키텍처, 다국어 설계, 보안 요구사항 전체)
- docs/07_사용가이드.md (설치/설정, 보안 체크리스트)

## TO-DO
상세 결정 히스토리는 백엔드는 `claude/rules/backend.md`, 프론트엔드는 `claude/rules/frontend.md` 참고.

완료됨:
- [x] 백엔드 뼈대, DB/검색엔진 어댑터 인터페이스+스텁, `.env.example`, 로컬용 `docker-compose.yml`(포트 바인딩 보안 기본값) — 알려진 미검증 사항은 `claude/rules/backend.md` 참고

남은 작업 (docs/06_개발가이드.md §12 순서 기준):
1. [x] X API OAuth 2.0 연동
2. [x] DB 어댑터 실제 구현
3. [x] 초기 아카이브 임포트 파이프라인
4. [x] Meilisearch 연동
5. [x] Elasticsearch 어댑터 확장 — `xpack.security.enabled` 강제 확인, Nori/Kuromoji/SmartCN 플러그인 연동, `lang` 필드 기준 언어별 필드 매핑
6. [x] 고급 검색 쿼리 파서
7. [x] 런타임 폴링 로직 — X API 크레딧 문제로 실데이터 폴링 자체는 라이브 검증 못함, 동기화 실패 시 프론트 경고 배너 추가함 (상세는 `claude/rules/backend.md`/`claude/rules/frontend.md` 참고)
8. [x] Docker Compose 서버 프로필 — 리버스 프록시(Caddy) 뒤 내부 네트워크 분리, 검색엔진 외부 포트 미노출
9. [x] 서버 모드 인증/HTTPS — Basic Auth는 이미 실제 라우트에 적용되어 있었음(확인 완료), Caddy 자동 HTTPS는 8번과 함께 구현 (문서상 원래 하나의 작업이었음, 상세는 `claude/rules/backend.md` 참고)
10. [x] Tailscale/Cloudflare Tunnel 외부 접속 구성 — compose profile(`tailscale`/`cloudflare-tunnel`)까지 구현, 실제 로그인/터널 연결 라이브 검증은 사용자 계정 필요로 보류 (상세는 `claude/rules/backend.md` 참고)
11. [x] pre-commit 시크릿 스캔(gitleaks) 설정
12. [x] 프론트엔드 구현 — 검색 화면 완료 (상세는 `claude/rules/frontend.md` 참고)

배포 전 남은 작업 (TODO #10 후속, 사용자 실배포 진행 중 — 위험도순):
13. [x] MEILI_MASTER_KEY 교체 — `openssl rand -base64 32`로 재발급, `backend/.env`에 반영 완료 (Meilisearch 컨테이너가 이미 떠 있다면 재시작 필요)
14. [x] APP_USERNAME / APP_PASSWORD 노출 방식별 on/off 적용 — `DOMAIN`/`CLOUDFLARE_TUNNEL_TOKEN`(공인 노출) 설정 시에만 필수로 `validateEnv()`가 실행 차단, Tailscale 전용(둘 다 미설정)이면 선택 — `backend/src/config/env.ts`, `backend/src/app.ts` 수정 완료. 사용자가 직접 정한 계정값을 `backend/.env`에 반영 완료
15. [x] APP_MODE=local → server 전환 — `backend/.env`에 반영 완료 (Tailscale 전용 노출, DOMAIN/CLOUDFLARE_TUNNEL_TOKEN 미설정)
16. [x] 서버 프로필 실배포 및 라이브 검증 — Docker 이미지 빌드/기동, `tailscale serve --bg http://backend:3000` 실행(최초 1회 tailnet에서 Serve 기능 승인 필요했음 — CLI 문법이 `https / <url>`에서 `<url>`로 변경된 점 포함 docs 반영 완료), `https://twitter-kr-achiver.<tailnet>.ts.net/`로 접속 확인, 사용자가 접속 기기 Tailscale 로그인 및 관리 콘솔에서 "Disable key expiry" 설정 완료
