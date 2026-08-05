### 백엔드 보완 완료 — 페이지네이션 + 검색어 하이라이트
착수 전 파악됐던 두 가지 백엔드 갭을 프론트 컴포넌트 작업 전에 먼저 처리. 결정 히스토리:
- `SearchProvider.search(query, filters?, pagination?)`로 시그니처 확장, `SearchResult`에 `hasMore: boolean` 필드 추가(`offset + hits.length < total`로 계산) — 프론트가 "더 보기" 버튼 노출 여부를 판단하는 데 사용.
- `GET /api/search`에 `limit`/`offset` 쿼리 파라미터 추가. 둘 다 음이 아닌 정수만 허용(형식 오류는 400), `limit`은 상한 50으로 clamp(기본값 20) — 셀프호스팅 단일 사용자 도구라 남용 위험은 낮지만 과도한 값 요청 시 검색엔진에 그대로 전달되는 걸 막기 위한 최소한의 방어.
- `SearchResult.hits` 타입을 `Post[]`에서 `SearchHit[]`(`Post` + `highlightedText: string`)로 확장. `MeilisearchAdapter`가 `attributesToHighlight: ["text"]` + `highlightPreTag/highlightPostTag`를 `<mark>`/`</mark>`로 설정해 매칭 구간만 감싸서 내려줌 — 다른 HTML 태그는 절대 섞이지 않으므로 프론트는 `dangerouslySetInnerHTML` 없이 `<mark>` 태그 구간만 정규식으로 잘라 React 엘리먼트로 렌더링하면 안전 (XSS 방지, 하이라이트 응답 형식 결정 완료).
- `ElasticsearchAdapter`는 시그니처만 인터페이스에 맞춰 갱신(여전히 미구현 스텁 유지).
- 검증: 로컬 Meilisearch(Windows 바이너리, Docker 미설치라 직접 실행) + 백엔드 서버를 실제로 기동해 end-to-end 확인 — 합성 게시글 60건 색인 → `limit=20/offset=0`(20건, hasMore=true) → `offset=20`(나머지, hasMore=false) → `limit=1000` 요청 시 50건으로 clamp되는지 → `limit=abc`/`offset=-1` 등 잘못된 값이 400을 반환하는지 → 하이라이트 응답에 `<mark>` 태그가 실제로 포함되는지 → 검색어 없이 조회 시 `highlightedText`가 원문 `text`로 폴백되는지까지 curl/스크립트로 확인. 테스트 산출물(스크립트, DB 파일, 다운로드한 바이너리)은 전부 정리함.

## 보안 점검 이력
- 고급 검색 쿼리 파서(TODO #6) 작업 착수 전, claude.md의 보안 필수 사항 + 코드 규칙 전체를 코드베이스 기준으로 재점검. SQL Injection/XSS/null 역참조/모듈화 등은 전부 준수 상태 확인.
- **발견 및 수정**: `backend/src/middleware/basicAuth.ts`가 아이디/비밀번호를 일반 `!==` 문자열 비교로 검증하고 있어 타이밍 공격에 이론적으로 노출됨 → `crypto.timingSafeEqual`(SHA-256으로 고정 길이화 후 비교) 방식으로 수정. 무인증/오답/정답 3가지 케이스 실제 서버 기동으로 검증 완료.

## TODO 이력

### 완료됨 (스캐폴딩)
- [x] 백엔드 뼈대, DB/검색엔진 어댑터 인터페이스+스텁, `.env.example`, 로컬용 `docker-compose.yml`(포트 바인딩 보안 기본값)

### 알려진 미검증 사항
- **`docker-compose.yml`(로컬 프로필) 자체는 실행 검증된 적 없음.** 이 개발 환경(Windows)에 Docker가 설치되어 있지 않아, Meilisearch 연동(TODO #4)은 Windows용 Meilisearch 바이너리를 직접 받아 로컬 실행하는 방식으로 애플리케이션 코드만 검증했음. `docker compose --profile meilisearch up -d` 명령 자체(YAML 문법, `${MEILI_MASTER_KEY:?...}` 환경변수 치환, 포트 바인딩 등)는 미검증 상태. `docs/07_사용가이드.md`가 사용자에게 안내하는 실제 설치 경로이므로 완전히 스킵할 사항은 아니며, Docker를 쓸 수 있는 환경이 되면(또는 TODO #8 서버 프로필 작업 시) 반드시 한 번 실행해서 확인 필요.

### TODO #1 — X API OAuth 2.0 연동
완료. 결정 히스토리:
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

### TODO #2 — DB 어댑터 실제 구현
완료. SqliteAdapter(`node:sqlite` 내장 모듈, 네이티브 빌드 불필요)/PostgresAdapter(`pg`) 완료. 스키마: posts(retweet_of_id로 리트윗 참조)/sync_state(channel=tweets|likes|bookmarks 단위)/oauth_tokens
- 추가: `PostgresAdapter.connect()`에 UTF8 인코딩 검증 추가 — Windows `initdb` 등에서 DB가 UTF8이 아닌 인코딩으로 생성되는 경우 한/영/일/중 다국어 저장이 깨질 수 있어, 연결 직후 `SHOW server_encoding` 조회 후 UTF8이 아니면 재생성 방법을 안내하는 에러로 즉시 중단. 실제 Postgres 인스턴스로는 미검증(코드 리뷰+타입체크로 갈음, 동일 파일 내 기존 검증된 쿼리 패턴과 동일).

### TODO #3 — 초기 아카이브 임포트 파이프라인
완료. 결정 히스토리:
- 원래 계획은 #12(React 프론트엔드) 단계에서 업로드 UI를 만드는 것이었으나, 사용자가 "지금 바로 HTML 업로드 화면 + 백엔드로 SQLite에 저장"을 원해 순서를 앞당김. React 프론트엔드가 생기면 이 페이지는 그 안의 설정/임포트 화면으로 흡수 예정.
- 구현: `backend/public/import.html`(파일 input + 진행률 표시, XHR 업로드) → `POST /api/import/archive`(multer, 2GB 제한, zip만 허용, 원본 파일명 대신 랜덤 UUID로 저장) → `importArchive()`가 zip을 스트리밍으로 열어(`unzipper`) `tweet.js`/`like.js`를 JS 변수 할당 프리픽스 제거 후 `stream-json`으로 파싱, 1,000건 배치 insert, 완료 후 `sync_state`(channel별 tweets/likes) 갱신. 처리 후 업로드된 zip은 서버에서 즉시 삭제.
- 알려진 제약사항(실제 X 아카이브로 미검증, 합성 픽스처로만 테스트함):
  - tweet.js에는 계정 소유자의 아이디가 없어 업로드 폼에서 `ownUsername`을 사용자가 직접 입력받음
  - like.js에는 좋아요 누른 시각이 없어 `created_at`을 임포트 시각으로 대체
  - `posts.retweet_of_id`는 FK로 강제하지 않음 — 리트윗 원본은 대개 타인의 트윗이라 우리 DB에 없는 게 정상 (스모크 테스트 중 FK 제약 위반으로 실제로 발견/수정한 버그)

### TODO #4 — Meilisearch 연동
완료. 결정 히스토리:
- `SearchProvider` 인터페이스에 `connect()` 초기화 메서드 추가 (DbAdapter와 동일 패턴) — 인덱스 생성 + `filterableAttributes`(authorUsername/lang/relation/createdAt) + `sortableAttributes`(createdAt) 등록을 서버 기동 시 1회 보장. 인터페이스 변경으로 아직 스텁인 `ElasticsearchAdapter`에도 `connect()` 메서드 추가함(미구현 상태 유지).
- Meilisearch 문서의 `createdAt`/`savedAt`은 Date 대신 unix seconds(숫자)로 저장 — 범위 필터(`since`/`until`)를 걸려면 문자열보다 숫자가 안전.
- 필터 값은 `JSON.stringify`로 이스케이프해 Meilisearch 필터 문법에 안전하게 삽입 (필터 인젝션 방지).
- `importArchive()`가 `db.batchInsertPosts` 직후 `search.bulkIndexDocuments`도 함께 호출하도록 배선 — 임포트 완료 시 자동 인덱싱된다는 사용자 가이드 §5-5 설명과 일치.
- 기본 검색 API(`GET /api/search?q=&lang=&relation=`) 추가. `lang`은 ko/en/ja/zh로 제한하지 않음 — X API의 `lang` 필드가 BCP-47 코드를 그대로 줄 수 있어 4개로 제한하면 실제 존재하는 데이터를 걸러낼 수 없는 문제가 있었음 (사용자와 논의 후 제한 해제 결정). `relation`은 스키마상 4값 고정이라 계속 엄격 검증. `from:`/`since:`/`until:` 등 고급 문법 파서는 TODO #6으로 별도 유지.
- 검증: Docker 미설치 환경이라 Meilisearch Windows 바이너리를 직접 다운로드해 로컬 실행, 실제 서버 기동으로 인덱스/설정 생성 확인 후 합성 아카이브 업로드 → 한국어 전문검색/`lang`/`relation` 필터 → 결과 확인까지 end-to-end로 검증 (테스트 산출물은 전부 정리함).

### TODO #5 — Elasticsearch 어댑터 확장
완료. 결정 히스토리:
- 남은 작업 중 영향도가 낮은 것부터 진행하자는 사용자 요청에 따라 순서상 우선순위로 선택 — 어댑터 패턴이라 기본 경로(Meilisearch)에는 영향 없음.
- **언어별 필드 매핑**: Meilisearch는 Charabia 토크나이저가 한 필드(`text`)에서 다국어를 자동 처리하지만, Elasticsearch는 언어별 analyzer를 필드 단위로 지정해야 해서 문서 구조 자체가 달라짐. `text_ko`(nori)/`text_ja`(kuromoji)/`text_zh`(smartcn)/`text`(standard, en 및 그 외 BCP-47 코드 폴백) 4개 필드로 설계하고, `post.lang` 값에 따라 색인 시 해당 필드 하나에만 본문을 채우는 방식(`toEsDocument`)으로 구현. `PostLang`이 4개 값으로 제한되지 않는다는 TODO #4 결정과 일관되게, 매핑에 없는 언어는 전부 `text`(standard analyzer)로 폴백.
- **검색 시 필드 선택**: `lang:` 필터가 있으면 해당 언어 필드 하나만, 없으면 4개 필드 전체를 `multi_match(best_fields)`로 검색 — 쿼리 파서(TODO #6)가 만드는 `SearchFilters`를 그대로 재사용.
- **플러그인 설치**: 베이스 이미지(`docker.elastic.co/elasticsearch/elasticsearch:8.15.0`)에 Nori/Kuromoji/SmartCN이 기본 포함되어 있지 않아, `docker/elasticsearch.Dockerfile`을 신규 작성(`elasticsearch-plugin install analysis-nori analysis-kuromoji analysis-smartcn`)하고 `docker-compose.yml`의 elasticsearch 서비스를 `image:` 대신 `build:`로 전환.
- **`xpack.security.enabled` 확인**: 기존 `docker-compose.yml`에 이미 `"true"`로 설정되어 있었고 `ELASTIC_PASSWORD` 필수 환경변수로도 강제되고 있어(`config/env.ts`) 추가 조치 불필요. 어댑터 쪽에서는 `@elastic/elasticsearch` Client에 `auth: { username, password }`를 연결.
- **`ELASTIC_USERNAME` 배선**: `.env.example`에는 있었지만 코드에서 미사용이던 죽은 변수를 발견, `search/index.ts` 팩토리가 `ElasticsearchAdapter` 생성자로 넘기도록 연결(기본값 `"elastic"`).
- **TLS**: `xpack.security.enabled=true`가 ES HTTP 레이어에 자체 서명 인증서를 자동 적용하므로 `tls: { rejectUnauthorized: false }`로 허용. 포트가 127.0.0.1에만 바인딩되고 비밀번호 인증이 필수로 강제되는 구성이라 감수 가능한 트레이드오프로 판단(정식 CA 인증서 구성은 범위 밖).
- 하이라이트는 Meilisearch와 동일하게 `<mark>`/`</mark>` 태그 컨벤션을 유지해 프론트 렌더링 로직을 공유.
- **검증 한계**: 이 개발 환경에 Docker가 설치되어 있지 않아(기존에도 known limitation, `docs/07_사용가이드.md` §9 참고) 실제 Elasticsearch 인스턴스로 커넥트/색인/검색을 라이브 검증하지 못함. 대신 `backend`에서 `npm install` 후 `npx tsc --noEmit`으로 타입 검증(에러 없음, `@elastic/elasticsearch` 8.15 클라이언트 타입 기준)까지만 확인. Docker를 쓸 수 있는 환경이 되면(또는 TODO #8 서버 프로필 작업 시) `docker compose --profile elasticsearch up -d --build`로 실제 플러그인 설치/인덱스 매핑/다국어 검색 동작을 반드시 한 번 확인 필요.

**후속 작업 — 검색엔진 전환 시 재색인(reindex) 기능 추가**
- 어댑터 구현 완료 후 사용자가 "Meilisearch로 이미 데이터를 쌓아둔 뒤 Elasticsearch로 전환하면 어떻게 되는지" 질문 → 코드 확인 결과 `bulkIndexDocuments`가 아카이브 임포트/폴링 시점에만 호출되고 있어, DB 전체를 검색엔진에 재색인하는 경로가 아예 없다는 갭을 발견 (검색엔진 전환 시 DB에는 데이터가 있어도 새 엔진 인덱스는 비어있어 검색이 안 되는 상태).
- `DbAdapter`에 `getPostsPage(offset, limit)` 추가(id 오름차순, Sqlite/Postgres 각각 구현) → `search/reindex.ts`의 `reindexAll()`이 1,000건 단위로 순회하며 `search.bulkIndexDocuments()` 호출 → `POST /api/admin/reindex` 라우트(`routes/adminRoutes.ts`)로 노출.
- 별도 삭제/클리어 없이 그대로 재색인하는 이유: `indexDocument`/`bulkIndexDocuments`는 Meilisearch/Elasticsearch 둘 다 id 기준 upsert라 이미 색인된 문서를 다시 넣어도 안전(idempotent) — 이 앱에는 게시글 삭제 기능 자체가 없어 새 엔진 인덱스에 존재해선 안 되는 stale 문서가 생길 여지도 없음.
- `docs/07_사용가이드.md` §3-2/§3-3/§4-2 갱신(v1.6→v1.7): 기존 문서가 실제 구현과 어긋나 있던 부분(수동 `elastic.co/start-local` 설치 스크립트+수동 플러그인 설치 안내, `text_en` 필드명 오기, 전환 시 "재인덱싱이 자동으로 진행됩니다"라는 잘못된 설명, `bin/elasticsearch-reset-password` 수동 실행 안내)을 실제 코드 기준(커스텀 Dockerfile 빌드, `text` 폴백 필드명, 수동 `/api/admin/reindex` 호출 필요, `.env`의 `ELASTIC_PASSWORD`로 컨테이너 기동 시 자동 설정)으로 정정. 셀프호스팅 사용자가 잘못된 안내로 "전환했는데 왜 검색이 안 되지"라는 상황에 빠지지 않도록 하기 위함.
- 검증: `npx tsc --noEmit` 통과. 실제 재색인 동작은 마찬가지로 Docker 미설치로 라이브 검증 못함(위 검증 한계와 동일 사유).

### TODO #6 — 고급 검색 쿼리 파서
완료. 결정 히스토리:
- `backend/src/search/queryParser.ts`: 정규식 1패스로 `from:`/`since:`/`until:`/`lang:`/`is:` 토큰을 추출해 필터로 변환, 나머지를 자유 검색어로 사용. 별도 NLP 라이브러리 없이 개발가이드 §7-4 지침대로 구현.
- `since:`/`until:`은 `dayjs`(customParseFormat 플러그인)로 `YYYY-MM-DD` 엄격 검증, 각각 그 날짜의 00:00:00/23:59:59로 변환(로컬 타임존 기준)해 해당 날짜 전체를 포함하도록 함.
- **스키마 확장**: `is:reply` 지원 여부를 검토하다가, X의 답글 여부는 `relation`(tweet/retweet/like/bookmark)과 별개 축이라는 게 드러남(한 글이 relation=tweet이면서 동시에 답글일 수 있음). `posts`에 `is_reply`(SQLite: INTEGER 0/1, Postgres: BOOLEAN) 컬럼을 신규 추가하고, `Post.isReply`/`SearchFilters.isReply`로 배선. 아카이브의 `in_reply_to_status_id_str` 필드 유무로 판별(`mapEntries.ts`), like.js는 답글 정보가 없어 항상 `false`. 기존 로컬 DB 파일은 마이그레이션 없이 새로 생성하는 것으로 처리(아직 실사용 데이터 없는 개발 초기 단계).
- `is:` 값 중 `reply`는 `relation`이 아니라 `isReply=true`로 매핑, 나머지(`tweet`/`retweet`/`like`/`bookmark`)는 기존대로 `relation`에 매핑 — 둘은 동시에 지정 가능(예: `is:retweet is:reply`).
- `GET /api/search`의 `q`가 이제 고급 문법을 직접 해석. 기존에 있던 별도 `lang`/`relation` 쿼리 파라미터는 `q`에서 파싱된 값보다 우선하는 override로 유지(향후 프론트엔드가 검색창+relation 필터 탭을 함께 쓰는 §10-2 레이아웃 고려).
- **알려진 사소한 이슈(의도적으로 보류)**: `lang:` 값은 대소문자 그대로 필터에 들어가 `lang:KO`처럼 대문자로 입력하면 조용히 0건이 됨(저장값은 항상 소문자). 개인 단일 사용자 도구라 실사용 영향이 적다고 판단해 코드 수정 대신 `docs/07_사용가이드.md`에 주의사항만 기재하기로 함. `from:`(계정명) 대소문자 이슈도 같은 이유로 보류.
- 검증: 파서 단위 테스트(순수 텍스트/from/since·until 범위/lang ko·en·ja/is:retweet·is:like 등호 매칭/조합 예문/잘못된 날짜·미지원 is 값 에러/대문자 토큰/lang 4개 외 값 통과 등 13개 문구) + `is:reply`/아카이브 매핑/DB 저장까지 별도 스크립트로 확인. Meilisearch 필터 자체는 기존에 검증한 것과 동일 패턴이라 이번엔 서버 재기동 없이 코드 검토로 갈음.

### TODO #7 — 런타임 폴링 로직
완료(단, X API 크레딧 문제로 실데이터 폴링 자체는 라이브 검증 못함, 아래 참고). 결정 히스토리:
- 파일 구성: `backend/src/auth/tokenRefresh.ts`(액세스 토큰 만료 임박 시 자동 갱신), `backend/src/polling/xApiClient.ts`(X API v2 호출 래퍼: getMe/listTweets/listLikedTweets/listBookmarks), `backend/src/polling/mapApiEntry.ts`(API 응답→Post 매핑), `backend/src/polling/pollChannels.ts`(채널별 폴링 전략+DB/검색엔진 반영), `backend/src/polling/scheduler.ts`(캐치업+interval 반복).
- **채널별 전략이 다른 이유**: 공식 문서로 확인한 결과 `GET /2/users/:id/tweets`는 `since_id`를 지원하지만, `liked_tweets`/`bookmarks`는 `since_id`/`until_id`를 지원하지 않고 `pagination_token`만 지원함. 그래서 tweets 채널은 `sync_state.last_synced_id`를 `since_id`로 그대로 써서 증분 조회하고, likes/bookmarks 채널은 최신 페이지부터 훑다가 마지막으로 저장된 id를 만나면 중단하는 "페이지워크" 방식으로 구현. 페이지워크는 오래 폴링을 못 돌린 경우에도 무한 루프에 빠지지 않도록 `MAX_PAGES_PER_CYCLE=10`(1,000건) 안전 상한을 둠 — 상한에 걸리면 이번 주기는 거기까지만 처리하고, 나머지는 다음 주기가 이어서 처리.
- **리트윗 매핑 이슈 발견**: X API v2에서 리트윗 항목은 top-level `author_id`가 원작성자가 아니라 "리트윗한 사용자(본인)"이고, top-level `text`도 140자 근처로 잘려서 내려오는 특성이 있음(공식 문서 확인). `referenced_tweets`(type=retweeted)로 원본 트윗 id를 찾고, `expansions=referenced_tweets.id,referenced_tweets.id.author_id`로 함께 딸려오는 `includes.tweets`/`includes.users`에서 원본 전체 텍스트/원작성자를 다시 조회하도록 구현.
- **토큰 갱신**: DB에 저장된 토큰의 `expiresAt`이 60초 이내로 임박하면 폴링 전에 `grant_type=refresh_token`으로 미리 갱신. X는 refresh_token을 요청마다 새로 발급(rotate)하므로 갱신 응답의 새 refresh_token을 반드시 다시 암호화해 저장(안 그러면 다음 갱신 시 이전 refresh_token이 무효화되어 재로그인 필요).
- **에러 격리**: tweets/likes/bookmarks 세 채널을 각각 try/catch로 감싸 하나가 실패해도 나머지는 계속 진행. `429`(rate limit)는 `XApiRateLimitError`로 구분해 `x-rate-limit-reset` 헤더를 로그에 남기고 이번 주기만 스킵.
- `env.ts`에 `X_POLL_INTERVAL_MINUTES`(선택, 기본 10분, 5~15 범위로 clamp) 추가. `server.ts`는 `db.getOAuthToken() !== null`일 때만(=X 계정이 실제로 연동된 경우만) 폴링을 시작 — 아카이브 임포트만 쓰는 사용자는 폴링 대상 아님. `SIGINT`/`SIGTERM` 시 `clearInterval`로 정리.
- 검증: mapApiEntry(본인글/리트윗 원본 텍스트·작성자 복원/답글 판별)·pollChannels(tweets since_id 증분/likes 경계 도달 시 중단/bookmarks MAX_PAGES 상한)·tokenRefresh(만료 임박 분기+refresh_token rotate 저장)·rate limit(429 시 채널 격리, 예외 전파 없음) 총 7개 케이스를 `fetch`를 목(mock)으로 대체한 스크립트로 단위 검증(모두 통과, 테스트 산출물 정리함) → 실제 Meilisearch(Windows 바이너리 재다운로드, 사용 후 삭제)+백엔드 서버를 실제 `.env`(사용자 실계정 토큰 포함)로 기동해 캐치업 폴링이 실제로 트리거되는지 확인.
- **알려진 한계(실사용 데이터로 미검증)**: 라이브 기동 시 `getMe()`(사용자 조회)는 성공했으나(토큰 복호화/Authorization 헤더/엔드포인트 라우팅이 실제로 X 서버까지 정상 도달·인증 통과했다는 뜻) tweets/likes/bookmarks 세 채널 모두 X API에서 `402 Payment Required — "credits depleted"` 응답을 받아 실제 데이터 조회 자체는 확인하지 못함. 코드 결함이 아니라 사용자의 X Developer 계정 API 크레딧/과금 상태 문제로 판단(에러가 크래시 없이 채널별로 격리되어 로그만 남고 사이클이 정상 완료된 것 자체는 에러 핸들링이 의도대로 동작함을 보여줌).
- **후속(백엔드 부분): 동기화 실패 상태 API 추가** (프론트 배너 쪽 구현은 `claude/rules/frontend.md` "동기화 경고 배너" 참고). 사용자가 "크레딧 없으면 프론트에 경고 표시 가능하냐"고 질문 → 계획 설명 후 렌더링 이미지까지 Artifact로 미리보고 승인받고 구현. `pollChannels.ts`의 `PollResult`에 `errors: {channel, status, message}[]` 추가(getMe 실패 시 세 채널 모두에 동일 에러 기록), `scheduler.ts`가 마지막 폴링 결과를 프로세스 인메모리에 보관(`pendingAuth.ts`와 같은 패턴, 재시작 시 초기화는 의도된 동작), 신규 `GET /api/polling/status`(`pollingRoutes.ts`)가 X 원문 에러 메시지는 노출하지 않고 `status===402`면 "크레딧/결제 문제로 추정"이라는 일반화된 문구만 반환. 검증: 실계정의 실제 402 상태로 엔드포인트 응답이 기대한 형태(`{connected, hasError, message, lastRanAt}`)로 오는지 curl로 확인.
- **비용 구조 재확인(2026-08 기준)**: X API는 본인 데이터 조회(Owned Reads)라도 완전 무료 티어가 없음 — 2026-02부터 신규 개발자용 Free 티어 자체가 폐지되어 전부 종량제이고, 그 이전 구 Free 티어도 원래 쓰기 전용(Read 접근 자체가 0건)이었음. Owned Reads $0.001/건(개인 사용 규모면 월 1달러 미만)이 공식 API로 가능한 가장 저렴한 경로이지만 결제수단 연결은 필수. **사용자와 논의 후 결정**: 크레딧 충전/실데이터 라이브 검증은 지금 당장 막힌 게 아니라 사용자가 원하는 시점으로 의도적으로 보류 — 기본 경로(아카이브 zip 재임포트, TODO #3, 완전 무료)는 이미 구현되어 있으므로 폴링(TODO #7, 소액 유료)은 "추가" 기능으로 취급하고 크레딧 충전 전까지는 `402`로 조용히 스킵되는 현재 상태 그대로 둔다.

### TODO #11 — pre-commit 시크릿 스캔(gitleaks) 설정
완료. 결정 히스토리:
- 남은 작업 중 영향도가 가장 낮은 것부터 진행하자는 사용자 요청에 따라 우선순위로 선택 (기존 런타임 코드/API/DB 스키마를 건드리지 않는 순수 개발 도구 추가라 리스크가 가장 낮다고 판단).
- **적용 대상 재확인**: 셀프호스팅해서 앱만 실행하는 외부 사용자는 git 커밋 워크플로 자체가 없어 해당 없음 — 이 리포에 실제로 코드를 커밋하는 개발자(현재는 사용자 본인)만을 위한 저장소 히스토리 보호 장치. `docs/07_사용가이드.md`(사용자용 문서)에는 반영하지 않음.
- **프레임워크 선택**: 루트에 `package.json`이 없는 구조(백엔드/프론트엔드 각각 별도 패키지)라 husky(npm `prepare` 훅)나 Python 기반 `pre-commit` 프레임워크를 새로 끌어오면 이 작업만을 위한 별도 런타임 의존성이 추가됨 → 과설계 방지 원칙에 따라 프레임워크 없이 `.githooks/pre-commit` 셸 스크립트 + `git config core.hooksPath .githooks`로 직접 연결하는 방식 채택.
- 구성: `.gitleaks.toml`(`useDefault = true`로 gitleaks 기본 룰 확장, `.env.example`/`docs/*.md`는 플레이스홀더뿐이라 allowlist 경로로 제외) + `.githooks/pre-commit`(스테이징된 변경사항을 `gitleaks protect --staged`로 검사, gitleaks 미설치 시에도 통과시키지 않고 설치 안내와 함께 커밋 차단 — 검사가 조용히 스킵되는 것을 방지).
- **주의**: `core.hooksPath`는 `.git/config`에 저장되는 로컬 설정이라 커밋되지 않음. 이 리포를 새로 클론하는 사람(현재는 사용자 본인이 유일)은 최초 1회 `git config core.hooksPath .githooks`를 직접 실행해야 훅이 활성화됨.

### TODO #8/#9 — Docker Compose 서버 프로필 + 서버 모드 인증/HTTPS
완료 (8/9 통합 진행). `claude.md`에서는 두 항목으로 나뉘어 있었지만, `docs/06_개발가이드.md` §9/§12 원본 설계는 애초에 "서버 프로필 하나에 Caddy 자동 HTTPS까지 기본 포함"으로 되어 있었고 `docs/07_사용가이드.md` §4-7도 이미 그렇게 사용자에게 안내하고 있었음 — 사용자에게 확인 후 통합 진행하기로 결정. 결정 히스토리:
- **Basic Auth 재확인**: TODO #9 설명은 "이미 스텁 있음"이었지만 실제로는 `backend/src/middleware/basicAuth.ts`(타이밍 세이프 비교, TODO #6 보안 점검 때 이미 강화됨)가 `app.ts`에서 `APP_MODE=server`일 때 이미 실제 적용되어 있었음 — 이번 작업에서 추가로 손댈 부분 없음, 확인만 하고 넘어감.
- **백엔드 컨테이너화**: 지금까지 백엔드는 `npm start`로 호스트에서 직접 실행하는 구조였고 `backend/Dockerfile`이 없었음. "검색엔진 외부 포트 미노출 + 리버스 프록시 뒤 네트워크 분리"를 제대로 하려면 백엔드도 컨테이너로 묶어 Caddy와 같은 내부 네트워크에 두는 게 맞다고 판단 → `backend/Dockerfile`(멀티스테이지: tsc 빌드 → `node:22-slim` 슬림 런타임, non-root `node` 유저로 실행) + `backend/.dockerignore`(`.env`/`data`/`node_modules` 제외 — 빌드 컨텍스트에 시크릿/DB가 절대 포함되지 않도록) 신규 추가.
- **오버레이 파일로 분리**: 기존 `docker-compose.yml`(로컬 전용, 127.0.0.1 바인딩)은 전혀 건드리지 않고, `docker/docker-compose.server.yml`을 `-f` 옵션으로 겹쳐 쓰는 방식 채택 — 로컬 개발 흐름에 영향 0.
- **`ports: []` override가 무시되는 버그 발견**: 처음엔 오버레이 파일에서 기존 `meilisearch`/`elasticsearch` 서비스의 `ports:`를 빈 배열로 override해서 지우려 했으나, 실제로 `docker compose config`로 검증해보니 이 개발 환경의 Docker Compose v2.15.1에서는 베이스 파일의 포트 바인딩이 그대로 살아남는 것을 확인(빈 시퀀스 override가 무시되는 구버전 병합 동작). 우회책으로 서버 전용 검색엔진 서비스(`meilisearch-server`/`elasticsearch-server`)를 별도로 새로 정의해 애초에 `ports:` 자체를 선언하지 않는 방식으로 변경, 프로필도 `server-meilisearch`/`server-elasticsearch`로 분리(로컬 `meilisearch`/`elasticsearch` 프로필과 이름이 겹치면 두 서비스가 동시에 뜨는 충돌이 생기기 때문).
- **사전 존재하던 버그 발견 및 수정**: `docker compose config`로 실제 검증하던 중, 베이스 `docker-compose.yml`의 `${MEILI_MASTER_KEY:?...}`/`${ELASTIC_PASSWORD:?...}`(필수 변수 문법)가 profile 필터링과 무관하게 **모든** 서비스에 대해 interpolation 시점에 평가된다는 걸 발견 — `--profile meilisearch`만 켜도 비활성 상태인 elasticsearch 서비스의 `ELASTIC_PASSWORD`가 없으면 전체 실행이 막히는 상태였음(반대도 마찬가지). 이 값은 원래 실행조차 안 되는 상태라 지금까지 아무도 발견 못했던 버그(§"알려진 미검증 사항" 참고). `:?`(필수) → `:-`(빈 문자열 기본값)로 완화하고, 실제 필수 검증은 원래도 진짜 강제력을 갖고 있던 `backend/src/config/env.ts`의 `validateEnv()`(선택된 `SEARCH_ENGINE` 기준으로만 필수 체크)에 맡기도록 정정. `docker compose config`로 4가지 조합(로컬 meilisearch/elasticsearch, 서버 server-meilisearch/server-elasticsearch 각각 상대편 시크릿 없이) 전부 정상 병합되는지 확인 완료.
- **네트워크 구성**: `internal`이라는 전용 브리지 네트워크에 backend/caddy/검색엔진을 모두 연결하되 `internal: true`(완전 격리)는 주지 않음 — 백엔드는 X API 아웃바운드 호출이 필요하고 Caddy는 Let's Encrypt ACME 아웃바운드 통신이 필요하기 때문. 인바운드 기준으로는 caddy의 `80`/`443`만 호스트에 게시되고 나머지는 전혀 게시되지 않음(포트 매핑 자체가 없음 — 로컬 프로필의 `127.0.0.1` 바인딩보다 한 단계 더 엄격).
- **Caddy 최소 권한**: Caddy 컨테이너에 `env_file`로 `backend/.env` 전체를 넘기면 `TOKEN_ENCRYPTION_KEY`/`X_CLIENT_SECRET` 등 리버스 프록시가 전혀 쓸 필요 없는 시크릿까지 컨테이너 환경변수로 들어가게 됨(공급망 공격/이미지 취약점 시 불필요한 노출 범위 확대) → `environment: [DOMAIN=${DOMAIN:-localhost}]`로 필요한 변수 하나만 명시적으로 전달.
- **`MEILI_HOST`/`ELASTIC_HOST` 재작성 필요성 발견**: `backend/.env`에 저장된 값은 로컬 프로필 기준(`http://127.0.0.1:7700` 등)이라 그대로 컨테이너에 흘려보내면 백엔드 컨테이너가 자기 자신의 루프백을 가리키게 되어 검색엔진에 연결할 수 없었음 — `docker-compose.server.yml`의 backend 서비스에 `environment:`로 `MEILI_HOST=http://meilisearch-server:7700`/`ELASTIC_HOST=https://elasticsearch-server:9200`을 명시적으로 덮어써서 해결(`environment`가 `env_file`보다 우선 적용됨을 `docker compose config`로 확인).
- **Caddy 구성**: `docker/Caddyfile`은 `{$DOMAIN:localhost} { reverse_proxy backend:3000 }` 최소 스켈레톤. `DOMAIN`이 이 서버를 실제로 가리키는 공인 도메인이면 Caddy가 HTTP-01/TLS-ALPN 챌린지로 Let's Encrypt 인증서를 자동 발급/갱신, 미설정 시 `localhost` 기준 Caddy 내부 CA 자체 서명 인증서로 동작(사설 네트워크 전용, 공인 브라우저에서는 경고가 정상).
- **검증 범위**: 이 개발 환경은 Docker CLI는 있지만 데몬이 떠 있지 않아(`docker run`류는 전부 실패) 실제 컨테이너 빌드/기동까지는 검증하지 못함. `docker compose config`(YAML 병합/interpolation/profile 필터링 자체)만으로 검증 가능한 범위는 4가지 프로필 조합 전부 확인 완료 — 실제 이미지 빌드·기동·Let's Encrypt 발급까지의 end-to-end 검증은 Docker 데몬을 쓸 수 있는 환경(또는 실제 배포 시)에서 한 번 더 필요.
- `docs/07_사용가이드.md` v1.8: 2-2/4-3/4-7을 실제 구현(오버레이 파일, `server-meilisearch`/`server-elasticsearch` 프로필명, `--env-file` 필요성, `DOMAIN` 기본값 동작)에 맞춰 갱신. `.env.example`에 `DOMAIN` 항목 추가.

### TODO #10 — Tailscale/Cloudflare Tunnel 외부 접속 구성
완료(단, 실제 로그인/터널 연결 라이브 검증은 미완료, 아래 참고). 결정 히스토리:
- **프로필 재구조화**: 기존엔 `caddy`가 `server-meilisearch`/`server-elasticsearch` 프로필에 묶여 항상 같이 떴는데, Tailscale/Cloudflare Tunnel은 둘 다 자체적으로 암호화/HTTPS 종단을 하므로 Caddy(공인 Let's Encrypt 전용)가 불필요함 → `caddy`를 `https`라는 독립 profile로 분리하고, `tailscale`/`cloudflare-tunnel` profile을 새로 추가해 노출 방식을 조합 선택 가능하게 변경(`--profile server-meilisearch --profile <https|tailscale|cloudflare-tunnel>`). 기존 TODO #8/#9에서 안내했던 `docs/07` §2-2/§4-7 명령어(`--profile server-meilisearch`만으로 caddy까지 포함)가 이 변경으로 깨져서 함께 갱신.
- **Tailscale 구현 방식 결정**: `tailscale/tailscale` 공식 sidecar 이미지를 `internal` 네트워크에 조인시키는 표준 패턴 채택(TUN 디바이스 + `NET_ADMIN`/`NET_RAW` capability, 상태 저장용 named volume). 실제로 백엔드에 도달시키는 방법으로 `tailscale serve` 사용을 검토했는데, 정적 `TS_SERVE_CONFIG` JSON 파일 스키마를 실제 Tailscale 계정 없이는 제가 검증할 수 없어(정확성을 보장 못하는 설정을 구워넣는 리스크) 최초 1회 `docker compose exec tailscale tailscale serve --bg https / http://backend:3000` CLI 명령을 문서로 안내하는 방식으로 대체 — `--bg`이므로 tailscaled 상태 볼륨에 저장되어 이후 재시작 시엔 재실행 불필요.
- **Cloudflare Tunnel 구현 방식 결정**: `config.yml` ingress 규칙을 미리 작성하는 방식 대신, 토큰 기반(`cloudflared tunnel run --token ...`) 방식 채택 — 라우팅(호스트네임 → 내부 서비스)은 전부 Cloudflare Zero Trust 대시보드에서 사용자가 직접 설정하므로 제가 스키마를 추측해서 잘못 구워넣을 리스크가 없음. 컴포즈 파일엔 토큰 하나만 필요.
- **동일한 `:?` 필수변수 버그 재발 방지**: TODO #8/#9에서 발견했던 "profile 무관하게 `${VAR:?...}` interpolation이 전체 서비스에 적용되는" 버그를 이번에 처음엔 `TS_AUTHKEY`/`CLOUDFLARE_TUNNEL_TOKEN`에도 그대로 반복할 뻔했으나(작성 직후 자체 검토로 발견) 같은 방식(`:-` 빈 기본값 + 실제 필수 검증은 컨테이너 자체의 인증 실패로 위임)으로 즉시 수정.
- **검증**: `docker compose config`로 4가지 조합(server-meilisearch+https, +tailscale, +cloudflare-tunnel, server-elasticsearch+https+cloudflare-tunnel 동시 조합) 전부 정상 병합 확인. `tailscale` 서비스 렌더링 결과(cap_add/devices/environment/volumes)도 직접 눈으로 확인.
- **알려진 한계**: Tailscale 로그인, Cloudflare Tunnel 실제 연결까지는 검증하지 못함 — 둘 다 사용자 본인 계정의 브라우저 로그인/OAuth가 필요해 제가 대신할 수 없고, 이 개발 환경은 Docker 데몬도 꺼져 있어 컨테이너 자체를 기동할 수도 없음(사용자와 논의 후 "가이드 먼저 작성, 실제 테스트는 사용자가 직접" 방향으로 진행하기로 결정). `docs/07_사용가이드.md` §4-5-1/§4-5-2에 계정 발급부터 단계별로 안내해뒀으니, 사용자가 실제로 계정을 만들고 `.env`에 값을 채운 뒤 직접(또는 Docker 데몬이 있는 환경에서 함께) 기동 테스트가 필요.
- `docs/07_사용가이드.md` v1.9: §4-5-1(Tailscale)/§4-5-2(Cloudflare Tunnel) 계정 발급+로그인+실행 가이드 신규 추가, §2-2/§4-7 명령어를 `https` profile 분리에 맞춰 갱신. `.env.example`에 `TS_AUTHKEY`/`TS_HOSTNAME`/`CLOUDFLARE_TUNNEL_TOKEN` 추가.
- 검증: 로컬에 `gitleaks` brew 설치 후, AWS 시크릿 패턴이 포함된 더미 `.env` 파일을 스테이징해 커밋 시도 → 차단되고 실제 커밋이 생성되지 않는 것을 `git log` 재확인, 더미 파일 정리 후 시크릿 없는 정상 변경으로 커밋 시도 → 통과되는 것까지 확인(테스트 커밋은 이후 `git reset --soft`로 정리, 워킹 트리 변경사항은 그대로 유지).
