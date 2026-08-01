import { Pool, type PoolClient } from "pg";
import type { DbAdapter, OAuthToken, Post, SyncChannel, SyncState } from "../DbAdapter";
import { POSTGRES_SCHEMA_SQL } from "../schema/postgres";

interface PostRow {
  id: string;
  author_username: string;
  text: string;
  lang: string | null;
  relation: Post["relation"];
  created_at: Date;
  saved_at: Date;
  url: string;
  retweet_of_id: string | null;
  source: Post["source"];
}

const INSERT_POST_SQL = `
  INSERT INTO posts
    (id, author_username, text, lang, relation, created_at, saved_at, url, retweet_of_id, source)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO NOTHING
`;

function postParams(post: Post): unknown[] {
  return [
    post.id,
    post.authorUsername,
    post.text,
    post.lang,
    post.relation,
    post.createdAt,
    post.savedAt,
    post.url,
    post.retweetOfId,
    post.source,
  ];
}

/** Postgres 어댑터 (선택 DB). */
export class PostgresAdapter implements DbAdapter {
  private pool: Pool | null = null;

  constructor(private readonly databaseUrl: string) {}

  private get connection(): Pool {
    if (!this.pool) {
      throw new Error("PostgresAdapter: connect()를 먼저 호출해야 합니다");
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    this.pool = new Pool({ connectionString: this.databaseUrl });
    await this.pool.query(POSTGRES_SCHEMA_SQL);
  }

  async disconnect(): Promise<void> {
    await this.connection.end();
    this.pool = null;
  }

  async insertPost(post: Post): Promise<void> {
    await this.connection.query(INSERT_POST_SQL, postParams(post));
  }

  async batchInsertPosts(posts: Post[]): Promise<void> {
    const CHUNK_SIZE = 1000;
    const client: PoolClient = await this.connection.connect();

    try {
      for (let i = 0; i < posts.length; i += CHUNK_SIZE) {
        const chunk = posts.slice(i, i + CHUNK_SIZE);
        await client.query("BEGIN");
        try {
          for (const post of chunk) {
            await client.query(INSERT_POST_SQL, postParams(post));
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    } finally {
      client.release();
    }
  }

  async getSyncState(channel: SyncChannel): Promise<SyncState> {
    const result = await this.connection.query<{
      channel: SyncChannel;
      last_synced_id: string | null;
      updated_at: Date;
    }>("SELECT * FROM sync_state WHERE channel = $1", [channel]);

    const row = result.rows[0];
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
    await this.connection.query(
      `INSERT INTO sync_state (channel, last_synced_id, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (channel) DO UPDATE SET last_synced_id = $2, updated_at = now()`,
      [channel, id],
    );
  }

  async getOAuthToken(): Promise<OAuthToken | null> {
    const result = await this.connection.query<{
      access_token: string;
      refresh_token: string;
      expires_at: Date;
      updated_at: Date;
    }>("SELECT access_token, refresh_token, expires_at, updated_at FROM oauth_tokens WHERE id = 1");

    const row = result.rows[0];
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
    await this.connection.query(
      `INSERT INTO oauth_tokens (id, access_token, refresh_token, expires_at, updated_at)
       VALUES (1, $1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         access_token = $1, refresh_token = $2, expires_at = $3, updated_at = $4`,
      [token.accessToken, token.refreshToken, token.expiresAt, token.updatedAt],
    );
  }
}
