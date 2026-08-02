import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { DbAdapter, OAuthToken, Post, SyncChannel, SyncState } from "../DbAdapter";
import { SQLITE_SCHEMA_SQL } from "../schema/sqlite";

/** "file:./data/archive.db" 형태의 DATABASE_URL에서 실제 파일 경로를 추출 */
function resolveFilePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
}

interface SyncStateRow {
  channel: SyncChannel;
  last_synced_id: string | null;
  updated_at: string;
}

interface OAuthTokenRow {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  updated_at: string;
}

const INSERT_POST_SQL = `
  INSERT OR IGNORE INTO posts
    (id, author_username, text, lang, relation, created_at, saved_at, url, retweet_of_id, is_reply, source)
  VALUES (@id, @authorUsername, @text, @lang, @relation, @createdAt, @savedAt, @url, @retweetOfId, @isReply, @source)
`;

function postParams(post: Post) {
  return {
    "@id": post.id,
    "@authorUsername": post.authorUsername,
    "@text": post.text,
    "@lang": post.lang,
    "@relation": post.relation,
    "@createdAt": post.createdAt.toISOString(),
    "@savedAt": post.savedAt.toISOString(),
    "@url": post.url,
    "@retweetOfId": post.retweetOfId,
    "@isReply": post.isReply ? 1 : 0,
    "@source": post.source,
  };
}

/**
 * SQLite 어댑터 (기본 DB). Node.js 내장 `node:sqlite`(Node 22.5+) 사용.
 * better-sqlite3 대신 이 모듈을 쓰는 이유: 네이티브 애드온 빌드(Visual Studio Build Tools 등)가
 * 전혀 필요 없어 셀프호스팅 설치 난이도를 낮출 수 있음 (claude.md TO-DO #2 논의 결과).
 */
export class SqliteAdapter implements DbAdapter {
  private db: DatabaseSync | null = null;

  constructor(private readonly databaseUrl: string) {}

  private get connection(): DatabaseSync {
    if (!this.db) {
      throw new Error("SqliteAdapter: connect()를 먼저 호출해야 합니다");
    }
    return this.db;
  }

  async connect(): Promise<void> {
    const filePath = resolveFilePath(this.databaseUrl);
    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SQLITE_SCHEMA_SQL);

    // §9 #7: DB 파일 권한을 소유자 전용(600)으로 강제. Windows에서는 chmod가 사실상 무의미하므로 실패를 무시.
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Windows 등 chmod 미지원 환경
    }
  }

  async disconnect(): Promise<void> {
    this.connection.close();
    this.db = null;
  }

  async insertPost(post: Post): Promise<void> {
    this.connection.prepare(INSERT_POST_SQL).run(postParams(post));
  }

  async batchInsertPosts(posts: Post[]): Promise<void> {
    const insert = this.connection.prepare(INSERT_POST_SQL);

    // 아카이브 백필: 1,000건 단위 트랜잭션 (docs/06_개발가이드.md §5-2)
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < posts.length; i += CHUNK_SIZE) {
      const chunk = posts.slice(i, i + CHUNK_SIZE);
      this.connection.exec("BEGIN");
      try {
        for (const post of chunk) {
          insert.run(postParams(post));
        }
        this.connection.exec("COMMIT");
      } catch (err) {
        this.connection.exec("ROLLBACK");
        throw err;
      }
    }
  }

  async getSyncState(channel: SyncChannel): Promise<SyncState> {
    const row = this.connection
      .prepare("SELECT * FROM sync_state WHERE channel = @channel")
      .get({ "@channel": channel }) as SyncStateRow | undefined;

    if (!row) {
      return { channel, lastSyncedId: null, updatedAt: new Date(0) };
    }

    return {
      channel: row.channel,
      lastSyncedId: row.last_synced_id,
      updatedAt: new Date(row.updated_at),
    };
  }

  async setLastSyncedId(channel: SyncChannel, id: string): Promise<void> {
    this.connection
      .prepare(
        `INSERT INTO sync_state (channel, last_synced_id, updated_at)
         VALUES (@channel, @id, @updatedAt)
         ON CONFLICT(channel) DO UPDATE SET last_synced_id = @id, updated_at = @updatedAt`,
      )
      .run({ "@channel": channel, "@id": id, "@updatedAt": new Date().toISOString() });
  }

  async getOAuthToken(): Promise<OAuthToken | null> {
    const row = this.connection
      .prepare("SELECT access_token, refresh_token, expires_at, updated_at FROM oauth_tokens WHERE id = 1")
      .get() as OAuthTokenRow | undefined;

    if (!row) {
      return null;
    }

    return {
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: new Date(row.expires_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async saveOAuthToken(token: OAuthToken): Promise<void> {
    this.connection
      .prepare(
        `INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at, updated_at)
         VALUES (1, @accessToken, @refreshToken, @expiresAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           access_token = @accessToken,
           refresh_token = @refreshToken,
           expires_at = @expiresAt,
           updated_at = @updatedAt`,
      )
      .run({
        "@accessToken": token.accessToken,
        "@refreshToken": token.refreshToken,
        "@expiresAt": token.expiresAt.toISOString(),
        "@updatedAt": token.updatedAt.toISOString(),
      });
  }
}
