import type { DbAdapter, Post, SyncState } from "../DbAdapter";

/**
 * SQLite 어댑터 (기본 DB).
 * 실제 쿼리/마이그레이션 로직은 아직 구현하지 않은 뼈대 상태.
 */
export class SqliteAdapter implements DbAdapter {
  constructor(private readonly databaseUrl: string) {}

  async connect(): Promise<void> {
    throw new Error("SqliteAdapter.connect: not implemented yet");
  }

  async disconnect(): Promise<void> {
    throw new Error("SqliteAdapter.disconnect: not implemented yet");
  }

  async insertPost(post: Post): Promise<void> {
    throw new Error("SqliteAdapter.insertPost: not implemented yet");
  }

  async batchInsertPosts(posts: Post[]): Promise<void> {
    throw new Error("SqliteAdapter.batchInsertPosts: not implemented yet");
  }

  async getSyncState(): Promise<SyncState> {
    throw new Error("SqliteAdapter.getSyncState: not implemented yet");
  }

  async setLastSyncedId(id: string): Promise<void> {
    throw new Error("SqliteAdapter.setLastSyncedId: not implemented yet");
  }
}
