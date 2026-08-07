/**
 * SQLite 스키마 (기본 DB). claude.md TO-DO #2 스키마 검토 결과 기준.
 * TS 상수로 관리하는 이유: tsc 빌드 시 dist에 .sql 등 비-TS 파일이 자동 복사되지 않아
 * 별도 빌드 스텝 없이도 바로 사용 가능하도록 SQL을 문자열로 보관.
 */
export const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id              TEXT NOT NULL,
  author_username TEXT NOT NULL,
  text            TEXT NOT NULL,
  lang            TEXT,
  relation        TEXT NOT NULL CHECK (relation IN ('tweet', 'retweet', 'like', 'bookmark')),
  created_at      TEXT NOT NULL,
  saved_at        TEXT NOT NULL,
  url             TEXT NOT NULL,
  -- 리트윗 원본 참조. FK로 강제하지 않음: 원본은 대개 타인의 트윗이라 우리 posts에 없는 게 정상
  retweet_of_id   TEXT,
  -- 답글 여부. relation과 별개 축(예: relation=tweet이면서 동시에 답글일 수 있음)
  is_reply        INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL CHECK (source IN ('archive_import', 'api_poll')),
  -- 같은 트윗 id가 tweet/retweet/like/bookmark로 동시에 존재할 수 있음(예: 본인 트윗을 본인이 좋아요)
  -- id 단독으로는 이 조합을 표현할 수 없어 (id, relation) 복합키로 구분
  PRIMARY KEY (id, relation)
);

CREATE INDEX IF NOT EXISTS idx_posts_relation ON posts(relation);
CREATE INDEX IF NOT EXISTS idx_posts_lang ON posts(lang);
CREATE INDEX IF NOT EXISTS idx_posts_author_username ON posts(author_username);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);

CREATE TABLE IF NOT EXISTS sync_state (
  channel         TEXT PRIMARY KEY CHECK (channel IN ('tweets', 'likes', 'bookmarks')),
  last_synced_id  TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
`;
