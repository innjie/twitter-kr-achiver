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

### 브랜딩 (docs/06 §10-1, claude.md 컨벤션과 동일)
- X 로고/브랜드명/브랜드 컬러 그대로 사용 금지 — 독자 이름/색상/로고 사용
- 카드형 피드, 페이지네이션 등 UX 패턴은 자유롭게 참고 가능 (상표 보호 대상 아님)

### 미결정 사항
- `import.html` 흡수 여부는 검색 화면 완성 후 재검토

## TODO 이력

### TODO #12 — 프론트엔드 구현 (검색 화면)
완료 (요구사항/구조는 위 `## 프론트엔드` 섹션 참고). 결정 히스토리:
- 하의상달식으로 진행: API 클라이언트(`src/api/search.ts`) → 하이라이트 파싱 유틸(`src/utils/highlight.ts`) → 프레젠테이션 컴포넌트(`SearchBar`/`RelationTabs`/`LangFilter`/`PostCard`/`Feed`) → `App.tsx`에서 상태 조립 순서.
- 상태관리: 화면이 검색 하나뿐이라 Redux/Zustand 등 별도 라이브러리 없이 React 기본 `useState`/`useEffect`만 사용. relation/lang 변경 시 `useEffect`로 자동 재조회(offset 리셋), 검색어는 `SearchBar` 제출 시에만 재조회.
- 하이라이트 렌더링: 백엔드가 `<mark>`만 포함해서 내려주는 것을 전제로, `dangerouslySetInnerHTML` 없이 정규식으로 구간을 나눠 React 엘리먼트(`<mark>`/일반 텍스트)로 렌더링 (XSS 방지).
- "더 보기": 클라이언트가 `offset`을 누적 관리, 클릭 시 기존 목록에 append. relation/lang 변경 시 offset 0으로 리셋하고 목록 교체.
- 언어 필터 드롭다운은 한/영/일/중(전체 포함) 5개 옵션만 제공 — `lang` 필드가 4개로 제한되지 않는다는 백엔드 원칙과 별개로, 목록에 없는 값은 검색창의 `lang:` 고급 문법으로 직접 입력 가능(§6 안내와 동일한 우회 경로).
- 검증: `chromium-cli`가 이 환경에 없어 Playwright(시스템 설치된 Chrome을 `channel: "chrome"`으로 구동)를 스크래치패드에 임시 설치해 대체 — 로컬 Meilisearch+백엔드에 relation/lang/isReply를 다양하게 섞은 합성 게시글 30건을 인덱싱하고 실제 브라우저로 초기 목록 렌더링/relation 탭 전환/언어 필터/검색어 하이라이트/"더 보기"(20→30건)까지 스크린샷으로 확인, 콘솔 에러 없음 확인. 테스트 프로세스/파일/임시 설치물 전부 정리.
- 미결정 유지: `import.html` 흡수 여부는 계속 보류(위 `## 프론트엔드` 섹션 참고).

### 동기화 경고 배너 (TODO #7 후속, 프론트 부분)
백엔드 쪽 폴링 실패 추적/`GET /api/polling/status` 구현은 `claude/rules/backend.md`의 TODO #7 참고. 사용자가 "크레딧 없으면 프론트에 경고 표시 가능하냐"고 질문 → 계획 설명 후 렌더링 이미지까지 Artifact로 미리보고 승인받고 구현. 결정 히스토리:
- `PollingWarningBanner.tsx`(앰버 톤, 아이콘+메시지+닫기 버튼, 세션 내에서만 닫기 가능 — 새로고침하면 다시 상태 조회해서 여전히 문제면 다시 뜸) + `App.tsx`가 로드 시 1회 `getPollingStatus()` 조회, 에러 있을 때만 렌더링.
- 위치는 검색바 위, 검색바는 그대로 sticky 유지하고 배너는 스크롤 시 함께 흘러가도록 배치(sticky로 겹치면 화면을 너무 많이 차지해서).
- 검증: 실계정의 실제 402 상태를 그대로 이용해 "경고" 상태를 라이브로, Playwright `page.route`로 `/api/polling/status`를 가로채 "정상"(배너 미노출) 상태를 각각 스크린샷/콘솔에러 없음까지 확인 → 두 상태 모두 사전에 승인받은 목업과 일치. 테스트 산출물(Meilisearch 바이너리, Playwright, 스크린샷) 전부 정리.

### 검색 정렬 토글 (TODO #17 후속, 프론트 부분)
백엔드 쪽 `sort` 파라미터/어댑터 구현은 `claude/rules/backend.md`의 TODO #17 참고. 결정 히스토리:
- `SortToggle.tsx` — "최신순"/"관련도순" 두 버튼, `LangFilter`와 동일한 톤(테두리 박스+선택 시 채움) 유지. `App.tsx`의 `sort` 상태(기본 `recency`)를 relation/lang과 동일하게 변경 시 자동 재조회 대상에 포함.
- **"토글이 반응 없다"는 버그 리포트 조사**: Playwright로 실제 클릭을 재현해보니 프론트는 정상적으로 `sort=relevance`/`sort=recency` 요청을 나눠 보내고 있었음(콘솔 에러도 없음) — 검색어 없이 "좋아요" 탭만 보고 있을 때 우연히 결과 순서가 같아 보였을 뿐, 프론트 코드 버그는 아니었음(근본 원인은 `claude/rules/backend.md` TODO #17 참고).
- `Feed.tsx`의 React `key`를 `hit.id` 단독 → `` `${hit.relation}-${hit.id}` ``로 수정 — posts 기본키를 `(id, relation)` 복합키로 바꾼 백엔드 변경(TODO #17)에 따라, 같은 트윗이 "전체" 뷰에서 여러 relation 카드로 동시에 나올 수 있게 되어 `id` 단독 키로는 충돌 가능.
