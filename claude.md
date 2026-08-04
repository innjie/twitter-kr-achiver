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
- 서버 모드는 Basic Auth 또는 앱 로그인 없이는 실행 차단
- 검색엔진 포트는 기본적으로 127.0.0.1에만 바인딩, 외부 노출 금지
- .env, DB 파일 등 민감 파일은 커밋/외부 노출 금지 (pre-commit 시크릿 스캔 포함)

### 점검 이력
- 고급 검색 쿼리 파서(TODO #6) 작업 착수 전, 위 보안 필수 사항 + 코드 규칙 전체를 코드베이스 기준으로 재점검. SQL Injection/XSS/null 역참조/모듈화 등은 전부 준수 상태 확인.
- **발견 및 수정**: `backend/src/middleware/basicAuth.ts`가 아이디/비밀번호를 일반 `!==` 문자열 비교로 검증하고 있어 타이밍 공격에 이론적으로 노출됨 → `crypto.timingSafeEqual`(SHA-256으로 고정 길이화 후 비교) 방식으로 수정. 무인증/오답/정답 3가지 케이스 실제 서버 기동으로 검증 완료.

## 코드 규칙
- 코딩 시 secure-coding 규칙 준수. (null 역참조, xss 방지, sql injection 등)
- 작성하는 언어의 변수는 기본 타입과는 다른 별도 변수명을 사용한다. (컴파일 에러 방지)
- 일관성 있는 코드 작성
- 가능한 경우 모듈화 진행, 한 파일에 너무 많은 정보가 들어가지 않게 한다.

## 컨벤션
- 커밋 메시지는 한국어로 작성
- API 키/시크릿은 반드시 .env에만 저장, 코드에 하드코딩 금지
- 새 기능 추가 전 항상 계획을 먼저 설명하고 승인받은 뒤 구현
- 파일 삭제, DB 스키마 변경 등 되돌리기 어려운 작업은 항상 먼저 확인받기
- 프론트엔드에서 X 로고/브랜드명/브랜드 컬러를 그대로 복제하지 않음 (UX 패턴만 참고, 독자 브랜드 요소 사용)

## 프론트엔드
(TODO #12 착수 전 요구사항 정리. 세부 화면 스펙은 docs/06_개발가이드.md §10 기준)

### 저장소/도구 구조
- `frontend/` 디렉토리, 기존 저장소 내 모노레포 (별도 git repo 아님) — 백엔드와 1:1 결합된 단일 셀프호스팅 제품이라 배포 단위가 하나
- Vite + React + TypeScript + Tailwind CSS 4 (`@tailwindcss/vite` 플러그인)
- 프로덕션: 백엔드가 같은 오리진에서 `frontend` 빌드 산출물을 정적 서빙 → CORS 불필요, `/api/...` 상대경로로 직접 호출
- 개발: Vite dev server `server.proxy`로 `/api` 요청을 백엔드(`localhost:3000`)로 전달

### 1차 범위
- 검색 화면만 구현 (업로드 `import.html`은 이번 범위 제외, 지금처럼 별도 정적 페이지로 유지 — React 완성 후 흡수 여부 재검토)

### 화면 구성 (docs/06 §10-2)
- 상단 고정 검색바 — 고급 문법(`from:`/`since:`/`until:`/`lang:`/`is:`)은 서버 `queryParser`가 처리하므로 프론트는 입력 텍스트를 그대로 `q`로 전달
- relation 필터 탭: 전체/트윗/리트윗/좋아요/북마크
- 언어 필터: relation 탭과 별도 드롭다운 (`posts.lang` 값 기준, ko/en/ja/zh로 제한하지 않음 — 백엔드와 동일 원칙)
- 카드형 피드: 작성자, 관계 배지, 본문(검색어 하이라이트), 날짜, 원본 링크
- 페이지네이션: "더 보기" 버튼 방식 (20~30건 단위, 무한스크롤/커서 기반 아님)
- 레이아웃: 단일 컬럼, 모바일/PC 공용(중앙 정렬된 좁은 폭)

### 예상 컴포넌트 (초안, 착수 시 조정 가능)
- `SearchBar`, `RelationTabs`, `LangFilter`, `PostCard`(하이라이트 렌더링 포함), `Feed`/`PostList`(더보기 포함), 빈 결과/에러 상태 표시

### 백엔드 보완 완료 — 페이지네이션 + 검색어 하이라이트
착수 전 파악됐던 두 가지 백엔드 갭을 프론트 컴포넌트 작업 전에 먼저 처리. 결정 히스토리:
- `SearchProvider.search(query, filters?, pagination?)`로 시그니처 확장, `SearchResult`에 `hasMore: boolean` 필드 추가(`offset + hits.length < total`로 계산) — 프론트가 "더 보기" 버튼 노출 여부를 판단하는 데 사용.
- `GET /api/search`에 `limit`/`offset` 쿼리 파라미터 추가. 둘 다 음이 아닌 정수만 허용(형식 오류는 400), `limit`은 상한 50으로 clamp(기본값 20) — 셀프호스팅 단일 사용자 도구라 남용 위험은 낮지만 과도한 값 요청 시 검색엔진에 그대로 전달되는 걸 막기 위한 최소한의 방어.
- `SearchResult.hits` 타입을 `Post[]`에서 `SearchHit[]`(`Post` + `highlightedText: string`)로 확장. `MeilisearchAdapter`가 `attributesToHighlight: ["text"]` + `highlightPreTag/highlightPostTag`를 `<mark>`/`</mark>`로 설정해 매칭 구간만 감싸서 내려줌 — 다른 HTML 태그는 절대 섞이지 않으므로 프론트는 `dangerouslySetInnerHTML` 없이 `<mark>` 태그 구간만 정규식으로 잘라 React 엘리먼트로 렌더링하면 안전 (XSS 방지, 하이라이트 응답 형식 결정 완료).
- `ElasticsearchAdapter`는 시그니처만 인터페이스에 맞춰 갱신(여전히 미구현 스텁 유지).
- 검증: 로컬 Meilisearch(Windows 바이너리, Docker 미설치라 직접 실행) + 백엔드 서버를 실제로 기동해 end-to-end 확인 — 합성 게시글 60건 색인 → `limit=20/offset=0`(20건, hasMore=true) → `offset=20`(나머지, hasMore=false) → `limit=1000` 요청 시 50건으로 clamp되는지 → `limit=abc`/`offset=-1` 등 잘못된 값이 400을 반환하는지 → 하이라이트 응답에 `<mark>` 태그가 실제로 포함되는지 → 검색어 없이 조회 시 `highlightedText`가 원문 `text`로 폴백되는지까지 curl/스크립트로 확인. 테스트 산출물(스크립트, DB 파일, 다운로드한 바이너리)은 전부 정리함.

### 브랜딩 (docs/06 §10-1, claude.md 컨벤션과 동일)
- X 로고/브랜드명/브랜드 컬러 그대로 사용 금지 — 독자 이름/색상/로고 사용
- 카드형 피드, 페이지네이션 등 UX 패턴은 자유롭게 참고 가능 (상표 보호 대상 아님)

### 미결정 사항
- `import.html` 흡수 여부는 검색 화면 완성 후 재검토

## 참고 문서
- docs/06_개발가이드.md (아키텍처, 다국어 설계, 보안 요구사항 전체)
- docs/07_사용가이드.md (설치/설정, 보안 체크리스트)

## TO-DO

완료됨:
- [x] 백엔드 뼈대, DB/검색엔진 어댑터 인터페이스+스텁, `.env.example`, 로컬용 `docker-compose.yml`(포트 바인딩 보안 기본값)

### 알려진 미검증 사항
- **`docker-compose.yml`(로컬 프로필) 자체는 실행 검증된 적 없음.** 이 개발 환경(Windows)에 Docker가 설치되어 있지 않아, Meilisearch 연동(TODO #4)은 Windows용 Meilisearch 바이너리를 직접 받아 로컬 실행하는 방식으로 애플리케이션 코드만 검증했음. `docker compose --profile meilisearch up -d` 명령 자체(YAML 문법, `${MEILI_MASTER_KEY:?...}` 환경변수 치환, 포트 바인딩 등)는 미검증 상태. `docs/07_사용가이드.md`가 사용자에게 안내하는 실제 설치 경로이므로 완전히 스킵할 사항은 아니며, Docker를 쓸 수 있는 환경이 되면(또는 TODO #8 서버 프로필 작업 시) 반드시 한 번 실행해서 확인 필요.

남은 작업 (docs/06_개발가이드.md §12 순서 기준):
1. [x] X API OAuth 2.0 연동 — 완료. 결정 히스토리:
   - 파일 구성: `backend/src/auth/pkce.ts`(code_verifier/challenge/state 생성), `tokenCrypto.ts`(AES-256-GCM 암복호화), `pendingAuth.ts`(state→code_verifier 인메모리 저장), `backend/src/routes/authRoutes.ts`(`GET /auth/login`/`callback`/`status`).
   - **state/code_verifier 저장소**: Redis 등 외부 저장소 대신 프로세스 인메모리 Map(TTL 10분, 1회용 소비)으로 관리 — 로컬 단일 인스턴스·단일 사용자 도구라 서버 재시작 사이 유실 정도는 감수 가능하다고 판단(과설계 방지).
   - **Redirect URI 화이트리스트**: 클라이언트가 `redirect_uri`를 요청 파라미터로 보낼 수 있는 경로 자체를 만들지 않고 `.env`의 `X_REDIRECT_URI`만 서버 내부에서 사용 — 구조적으로 오픈 리다이렉트 불가능.
   - **토큰 암호화**: AES-256-GCM(인증 태그 포함), `TOKEN_ENCRYPTION_KEY`(32바이트 hex)로 암복호화. `env.ts`에 기존에는 존재 여부만 검증하던 것을, 32바이트 hex 형식인지까지 검증하도록 강화(형식이 안 맞으면 명확한 에러로 시작 차단).
   - **`X_CLIENT_ID`/`X_CLIENT_SECRET`/`X_REDIRECT_URI`는 앱 시작 시 필수 아님** — 아카이브 임포트만 쓰는 사용자도 서버를 띄울 수 있어야 하므로, `/auth/login` 호출 시점에만 검증.
   - scope: `tweet.read users.read like.read bookmark.read offline.access` (offline.access가 없으면 refresh_token이 발급되지 않아 명시적으로 포함, 없을 시 502 에러로 안내).
   - **범위 제외**: Refresh Token을 이용한 액세스 토큰 갱신 로직은 이번 범위에 넣지 않음 — 실제로 쓰이는 시점인 TODO #7(런타임 폴링)에서 함께 구현 예정.
   - **버그 발견/수정**: `tokenCrypto.decryptToken()`이 빈 문자열 암호화 결과(암호문 파트가 빈 문자열)를 falsy 체크로 잘못 "형식 오류"로 판정하던 버그를 단위 테스트 중 발견 → `parts.length !== 3` 체크로 수정.
   - **검증**: PKCE(challenge가 verifier의 SHA-256/base64url과 일치)/토큰 암호화 round-trip(한글 포함, 잘못된 키로 복호화 시 예외)/pendingAuth(1회성·만료) 단위 스크립트로 확인 → 실제 서버 기동 후 curl로 `/auth/login` 리다이렉트 파라미터, `/auth/callback`의 state 불일치·X 거부(`access_denied`) 에러 처리, `/auth/status` 확인 → **사용자 본인의 실제 X Developer App으로 브라우저에서 직접 로그인까지 완료**, DB에 저장된 토큰이 실제로 암호화된 형태(평문 아님)이고 올바른 키로 복호화되는지까지 스크립트로 확인. 테스트 산출물 전부 정리(단, `backend/.env`·`backend/data/archive.db`는 사용자의 실제 설정/데이터라 유지).
   - `docs/07_사용가이드.md` §5 갱신(v1.6): 앱 권한/타입/Callback URI 구체화, `.env` 설정표 및 `TOKEN_ENCRYPTION_KEY` 생성법(사용자마다 반드시 다른 값 필요) 추가, `/auth/login` 직접 접속 방식으로 갱신(프론트 연동 버튼은 아직 없음).
2. [x] DB 어댑터 실제 구현 — SqliteAdapter(`node:sqlite` 내장 모듈, 네이티브 빌드 불필요)/PostgresAdapter(`pg`) 완료. 스키마: posts(retweet_of_id로 리트윗 참조)/sync_state(channel=tweets|likes|bookmarks 단위)/oauth_tokens
   - 추가: `PostgresAdapter.connect()`에 UTF8 인코딩 검증 추가 — Windows `initdb` 등에서 DB가 UTF8이 아닌 인코딩으로 생성되는 경우 한/영/일/중 다국어 저장이 깨질 수 있어, 연결 직후 `SHOW server_encoding` 조회 후 UTF8이 아니면 재생성 방법을 안내하는 에러로 즉시 중단. 실제 Postgres 인스턴스로는 미검증(코드 리뷰+타입체크로 갈음, 동일 파일 내 기존 검증된 쿼리 패턴과 동일).
3. [x] 초기 아카이브 임포트 파이프라인 — 완료. 결정 히스토리:
   - 원래 계획은 #12(React 프론트엔드) 단계에서 업로드 UI를 만드는 것이었으나, 사용자가 "지금 바로 HTML 업로드 화면 + 백엔드로 SQLite에 저장"을 원해 순서를 앞당김. React 프론트엔드가 생기면 이 페이지는 그 안의 설정/임포트 화면으로 흡수 예정.
   - 구현: `backend/public/import.html`(파일 input + 진행률 표시, XHR 업로드) → `POST /api/import/archive`(multer, 2GB 제한, zip만 허용, 원본 파일명 대신 랜덤 UUID로 저장) → `importArchive()`가 zip을 스트리밍으로 열어(`unzipper`) `tweet.js`/`like.js`를 JS 변수 할당 프리픽스 제거 후 `stream-json`으로 파싱, 1,000건 배치 insert, 완료 후 `sync_state`(channel별 tweets/likes) 갱신. 처리 후 업로드된 zip은 서버에서 즉시 삭제.
   - 알려진 제약사항(실제 X 아카이브로 미검증, 합성 픽스처로만 테스트함):
     - tweet.js에는 계정 소유자의 아이디가 없어 업로드 폼에서 `ownUsername`을 사용자가 직접 입력받음
     - like.js에는 좋아요 누른 시각이 없어 `created_at`을 임포트 시각으로 대체
     - `posts.retweet_of_id`는 FK로 강제하지 않음 — 리트윗 원본은 대개 타인의 트윗이라 우리 DB에 없는 게 정상 (스모크 테스트 중 FK 제약 위반으로 실제로 발견/수정한 버그)
4. [x] Meilisearch 연동 — 완료. 결정 히스토리:
   - `SearchProvider` 인터페이스에 `connect()` 초기화 메서드 추가 (DbAdapter와 동일 패턴) — 인덱스 생성 + `filterableAttributes`(authorUsername/lang/relation/createdAt) + `sortableAttributes`(createdAt) 등록을 서버 기동 시 1회 보장. 인터페이스 변경으로 아직 스텁인 `ElasticsearchAdapter`에도 `connect()` 메서드 추가함(미구현 상태 유지).
   - Meilisearch 문서의 `createdAt`/`savedAt`은 Date 대신 unix seconds(숫자)로 저장 — 범위 필터(`since`/`until`)를 걸려면 문자열보다 숫자가 안전.
   - 필터 값은 `JSON.stringify`로 이스케이프해 Meilisearch 필터 문법에 안전하게 삽입 (필터 인젝션 방지).
   - `importArchive()`가 `db.batchInsertPosts` 직후 `search.bulkIndexDocuments`도 함께 호출하도록 배선 — 임포트 완료 시 자동 인덱싱된다는 사용자 가이드 §5-5 설명과 일치.
   - 기본 검색 API(`GET /api/search?q=&lang=&relation=`) 추가. `lang`은 ko/en/ja/zh로 제한하지 않음 — X API의 `lang` 필드가 BCP-47 코드를 그대로 줄 수 있어 4개로 제한하면 실제 존재하는 데이터를 걸러낼 수 없는 문제가 있었음 (사용자와 논의 후 제한 해제 결정). `relation`은 스키마상 4값 고정이라 계속 엄격 검증. `from:`/`since:`/`until:` 등 고급 문법 파서는 TODO #6으로 별도 유지.
   - 검증: Docker 미설치 환경이라 Meilisearch Windows 바이너리를 직접 다운로드해 로컬 실행, 실제 서버 기동으로 인덱스/설정 생성 확인 후 합성 아카이브 업로드 → 한국어 전문검색/`lang`/`relation` 필터 → 결과 확인까지 end-to-end로 검증 (테스트 산출물은 전부 정리함).
5. [ ] Elasticsearch 어댑터 확장 — `xpack.security.enabled` 강제 확인, Nori/Kuromoji/SmartCN 플러그인 연동, `lang` 필드 기준 언어별 필드 매핑
6. [x] 고급 검색 쿼리 파서 — 완료. 결정 히스토리:
   - `backend/src/search/queryParser.ts`: 정규식 1패스로 `from:`/`since:`/`until:`/`lang:`/`is:` 토큰을 추출해 필터로 변환, 나머지를 자유 검색어로 사용. 별도 NLP 라이브러리 없이 개발가이드 §7-4 지침대로 구현.
   - `since:`/`until:`은 `dayjs`(customParseFormat 플러그인)로 `YYYY-MM-DD` 엄격 검증, 각각 그 날짜의 00:00:00/23:59:59로 변환(로컬 타임존 기준)해 해당 날짜 전체를 포함하도록 함.
   - **스키마 확장**: `is:reply` 지원 여부를 검토하다가, X의 답글 여부는 `relation`(tweet/retweet/like/bookmark)과 별개 축이라는 게 드러남(한 글이 relation=tweet이면서 동시에 답글일 수 있음). `posts`에 `is_reply`(SQLite: INTEGER 0/1, Postgres: BOOLEAN) 컬럼을 신규 추가하고, `Post.isReply`/`SearchFilters.isReply`로 배선. 아카이브의 `in_reply_to_status_id_str` 필드 유무로 판별(`mapEntries.ts`), like.js는 답글 정보가 없어 항상 `false`. 기존 로컬 DB 파일은 마이그레이션 없이 새로 생성하는 것으로 처리(아직 실사용 데이터 없는 개발 초기 단계).
   - `is:` 값 중 `reply`는 `relation`이 아니라 `isReply=true`로 매핑, 나머지(`tweet`/`retweet`/`like`/`bookmark`)는 기존대로 `relation`에 매핑 — 둘은 동시에 지정 가능(예: `is:retweet is:reply`).
   - `GET /api/search`의 `q`가 이제 고급 문법을 직접 해석. 기존에 있던 별도 `lang`/`relation` 쿼리 파라미터는 `q`에서 파싱된 값보다 우선하는 override로 유지(향후 프론트엔드가 검색창+relation 필터 탭을 함께 쓰는 §10-2 레이아웃 고려).
   - **알려진 사소한 이슈(의도적으로 보류)**: `lang:` 값은 대소문자 그대로 필터에 들어가 `lang:KO`처럼 대문자로 입력하면 조용히 0건이 됨(저장값은 항상 소문자). 개인 단일 사용자 도구라 실사용 영향이 적다고 판단해 코드 수정 대신 `docs/07_사용가이드.md`에 주의사항만 기재하기로 함. `from:`(계정명) 대소문자 이슈도 같은 이유로 보류.
   - 검증: 파서 단위 테스트(순수 텍스트/from/since·until 범위/lang ko·en·ja/is:retweet·is:like 등호 매칭/조합 예문/잘못된 날짜·미지원 is 값 에러/대문자 토큰/lang 4개 외 값 통과 등 13개 문구) + `is:reply`/아카이브 매핑/DB 저장까지 별도 스크립트로 확인. Meilisearch 필터 자체는 기존에 검증한 것과 동일 패턴이라 이번엔 서버 재기동 없이 코드 검토로 갈음.
7. [x] 런타임 폴링 로직 — 완료(단, X API 크레딧 문제로 실데이터 폴링 자체는 라이브 검증 못함, 아래 참고). 결정 히스토리:
   - 파일 구성: `backend/src/auth/tokenRefresh.ts`(액세스 토큰 만료 임박 시 자동 갱신), `backend/src/polling/xApiClient.ts`(X API v2 호출 래퍼: getMe/listTweets/listLikedTweets/listBookmarks), `backend/src/polling/mapApiEntry.ts`(API 응답→Post 매핑), `backend/src/polling/pollChannels.ts`(채널별 폴링 전략+DB/검색엔진 반영), `backend/src/polling/scheduler.ts`(캐치업+interval 반복).
   - **채널별 전략이 다른 이유**: 공식 문서로 확인한 결과 `GET /2/users/:id/tweets`는 `since_id`를 지원하지만, `liked_tweets`/`bookmarks`는 `since_id`/`until_id`를 지원하지 않고 `pagination_token`만 지원함. 그래서 tweets 채널은 `sync_state.last_synced_id`를 `since_id`로 그대로 써서 증분 조회하고, likes/bookmarks 채널은 최신 페이지부터 훑다가 마지막으로 저장된 id를 만나면 중단하는 "페이지워크" 방식으로 구현. 페이지워크는 오래 폴링을 못 돌린 경우에도 무한 루프에 빠지지 않도록 `MAX_PAGES_PER_CYCLE=10`(1,000건) 안전 상한을 둠 — 상한에 걸리면 이번 주기는 거기까지만 처리하고, 나머지는 다음 주기가 이어서 처리.
   - **리트윗 매핑 이슈 발견**: X API v2에서 리트윗 항목은 top-level `author_id`가 원작성자가 아니라 "리트윗한 사용자(본인)"이고, top-level `text`도 140자 근처로 잘려서 내려오는 특성이 있음(공식 문서 확인). `referenced_tweets`(type=retweeted)로 원본 트윗 id를 찾고, `expansions=referenced_tweets.id,referenced_tweets.id.author_id`로 함께 딸려오는 `includes.tweets`/`includes.users`에서 원본 전체 텍스트/원작성자를 다시 조회하도록 구현.
   - **토큰 갱신**: DB에 저장된 토큰의 `expiresAt`이 60초 이내로 임박하면 폴링 전에 `grant_type=refresh_token`으로 미리 갱신. X는 refresh_token을 요청마다 새로 발급(rotate)하므로 갱신 응답의 새 refresh_token을 반드시 다시 암호화해 저장(안 그러면 다음 갱신 시 이전 refresh_token이 무효화되어 재로그인 필요).
   - **에러 격리**: tweets/likes/bookmarks 세 채널을 각각 try/catch로 감싸 하나가 실패해도 나머지는 계속 진행. `429`(rate limit)는 `XApiRateLimitError`로 구분해 `x-rate-limit-reset` 헤더를 로그에 남기고 이번 주기만 스킵.
   - `env.ts`에 `X_POLL_INTERVAL_MINUTES`(선택, 기본 10분, 5~15 범위로 clamp) 추가. `server.ts`는 `db.getOAuthToken() !== null`일 때만(=X 계정이 실제로 연동된 경우만) 폴링을 시작 — 아카이브 임포트만 쓰는 사용자는 폴링 대상 아님. `SIGINT`/`SIGTERM` 시 `clearInterval`로 정리.
   - 검증: mapApiEntry(본인글/리트윗 원본 텍스트·작성자 복원/답글 판별)·pollChannels(tweets since_id 증분/likes 경계 도달 시 중단/bookmarks MAX_PAGES 상한)·tokenRefresh(만료 임박 분기+refresh_token rotate 저장)·rate limit(429 시 채널 격리, 예외 전파 없음) 총 7개 케이스를 `fetch`를 목(mock)으로 대체한 스크립트로 단위 검증(모두 통과, 테스트 산출물 정리함) → 실제 Meilisearch(Windows 바이너리 재다운로드, 사용 후 삭제)+백엔드 서버를 실제 `.env`(사용자 실계정 토큰 포함)로 기동해 캐치업 폴링이 실제로 트리거되는지 확인.
   - **알려진 한계(실사용 데이터로 미검증)**: 라이브 기동 시 `getMe()`(사용자 조회)는 성공했으나(토큰 복호화/Authorization 헤더/엔드포인트 라우팅이 실제로 X 서버까지 정상 도달·인증 통과했다는 뜻) tweets/likes/bookmarks 세 채널 모두 X API에서 `402 Payment Required — "credits depleted"` 응답을 받아 실제 데이터 조회 자체는 확인하지 못함. 코드 결함이 아니라 사용자의 X Developer 계정 API 크레딧/과금 상태 문제로 판단(에러가 크래시 없이 채널별로 격리되어 로그만 남고 사이클이 정상 완료된 것 자체는 에러 핸들링이 의도대로 동작함을 보여줌).
   - **후속: 동기화 실패 프론트 경고 배너 추가**. 사용자가 "크레딧 없으면 프론트에 경고 표시 가능하냐"고 질문 → 계획 설명 후 렌더링 이미지까지 Artifact로 미리보고 승인받고 구현. 백엔드: `pollChannels.ts`의 `PollResult`에 `errors: {channel, status, message}[]` 추가(getMe 실패 시 세 채널 모두에 동일 에러 기록), `scheduler.ts`가 마지막 폴링 결과를 프로세스 인메모리에 보관(`pendingAuth.ts`와 같은 패턴, 재시작 시 초기화는 의도된 동작), 신규 `GET /api/polling/status`(`pollingRoutes.ts`)가 X 원문 에러 메시지는 노출하지 않고 `status===402`면 "크레딧/결제 문제로 추정"이라는 일반화된 문구만 반환. 프론트: `PollingWarningBanner.tsx`(앰버 톤, 세션 내에서만 닫기 가능) + `App.tsx`가 로드 시 1회 상태 조회. 검증: 실계정의 실제 402 상태를 그대로 이용해 "경고" 상태를 라이브로, Playwright `page.route`로 `/api/polling/status`를 가로채 "정상"(배너 미노출) 상태를 각각 스크린샷/콘솔에러 없음까지 확인 → 두 상태 모두 사전에 승인받은 목업과 일치. 테스트 산출물(Meilisearch 바이너리, Playwright, 스크린샷) 전부 정리.
   - **비용 구조 재확인(2026-08 기준)**: X API는 본인 데이터 조회(Owned Reads)라도 완전 무료 티어가 없음 — 2026-02부터 신규 개발자용 Free 티어 자체가 폐지되어 전부 종량제이고, 그 이전 구 Free 티어도 원래 쓰기 전용(Read 접근 자체가 0건)이었음. Owned Reads $0.001/건(개인 사용 규모면 월 1달러 미만)이 공식 API로 가능한 가장 저렴한 경로이지만 결제수단 연결은 필수. **사용자와 논의 후 결정**: 크레딧 충전/실데이터 라이브 검증은 지금 당장 막힌 게 아니라 사용자가 원하는 시점으로 의도적으로 보류 — 기본 경로(아카이브 zip 재임포트, TODO #3, 완전 무료)는 이미 구현되어 있으므로 폴링(TODO #7, 소액 유료)은 "추가" 기능으로 취급하고 크레딧 충전 전까지는 `402`로 조용히 스킵되는 현재 상태 그대로 둔다.
8. [ ] Docker Compose 서버 프로필 — 리버스 프록시(Caddy/Nginx) 뒤 내부 네트워크 분리, 검색엔진 외부 포트 미노출
9. [ ] 서버 모드 인증/HTTPS — Basic Auth(이미 스텁 있음)를 실제 라우트에 적용, Caddy 자동 HTTPS 구성
10. [ ] Tailscale/Cloudflare Tunnel 외부 접속 구성
11. [ ] pre-commit 시크릿 스캔(gitleaks) 설정
12. [x] 프론트엔드 구현 — 검색 화면 완료(요구사항/구조는 `## 프론트엔드` 섹션 참고). 결정 히스토리:
    - 하의상달식으로 진행: API 클라이언트(`src/api/search.ts`) → 하이라이트 파싱 유틸(`src/utils/highlight.ts`) → 프레젠테이션 컴포넌트(`SearchBar`/`RelationTabs`/`LangFilter`/`PostCard`/`Feed`) → `App.tsx`에서 상태 조립 순서.
    - 상태관리: 화면이 검색 하나뿐이라 Redux/Zustand 등 별도 라이브러리 없이 React 기본 `useState`/`useEffect`만 사용. relation/lang 변경 시 `useEffect`로 자동 재조회(offset 리셋), 검색어는 `SearchBar` 제출 시에만 재조회.
    - 하이라이트 렌더링: 백엔드가 `<mark>`만 포함해서 내려주는 것을 전제로, `dangerouslySetInnerHTML` 없이 정규식으로 구간을 나눠 React 엘리먼트(`<mark>`/일반 텍스트)로 렌더링 (XSS 방지).
    - "더 보기": 클라이언트가 `offset`을 누적 관리, 클릭 시 기존 목록에 append. relation/lang 변경 시 offset 0으로 리셋하고 목록 교체.
    - 언어 필터 드롭다운은 한/영/일/중(전체 포함) 5개 옵션만 제공 — `lang` 필드가 4개로 제한되지 않는다는 백엔드 원칙과 별개로, 목록에 없는 값은 검색창의 `lang:` 고급 문법으로 직접 입력 가능(§6 안내와 동일한 우회 경로).
    - 검증: `chromium-cli`가 이 환경에 없어 Playwright(시스템 설치된 Chrome을 `channel: "chrome"`으로 구동)를 스크래치패드에 임시 설치해 대체 — 로컬 Meilisearch+백엔드에 relation/lang/isReply를 다양하게 섞은 합성 게시글 30건을 인덱싱하고 실제 브라우저로 초기 목록 렌더링/relation 탭 전환/언어 필터/검색어 하이라이트/"더 보기"(20→30건)까지 스크린샷으로 확인, 콘솔 에러 없음 확인. 테스트 프로세스/파일/임시 설치물 전부 정리.
    - 미결정 유지: `import.html` 흡수 여부는 계속 보류(`## 프론트엔드` 섹션 참고).

