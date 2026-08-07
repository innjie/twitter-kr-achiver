/**
 * Postgres 스키마 (선택 DB). SQLite와 동일 스키마를 유지 (docs/06_개발가이드.md §6).
 */
export const POSTGRES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id              TEXT NOT NULL,
  author_username TEXT NOT NULL,
  text            TEXT NOT NULL,
  lang            TEXT,
  relation        TEXT NOT NULL CHECK (relation IN ('tweet', 'retweet', 'like', 'bookmark')),
  created_at      TIMESTAMPTZ NOT NULL,
  saved_at        TIMESTAMPTZ NOT NULL,
  url             TEXT NOT NULL,
  -- 리트윗 원본 참조. FK로 강제하지 않음: 원본은 대개 타인의 트윗이라 우리 posts에 없는 게 정상
  retweet_of_id   TEXT,
  -- 답글 여부. relation과 별개 축(예: relation=tweet이면서 동시에 답글일 수 있음)
  is_reply        BOOLEAN NOT NULL DEFAULT FALSE,
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
  updated_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL
);
`;
