import type { DbAdapter } from "./DbAdapter";
import { SqliteAdapter } from "./adapters/SqliteAdapter";
import { PostgresAdapter } from "./adapters/PostgresAdapter";

/**
 * .env의 DB_TYPE(sqlite | postgres)에 따라 어댑터를 선택하는 팩토리.
 */
export function createDbAdapter(): DbAdapter {
  const dbType = process.env.DB_TYPE ?? "sqlite";
  const databaseUrl = process.env.DATABASE_URL ?? "";

  switch (dbType) {
    case "sqlite":
      return new SqliteAdapter(databaseUrl);
    case "postgres":
      return new PostgresAdapter(databaseUrl);
    default:
      throw new Error(`알 수 없는 DB_TYPE: ${dbType} (sqlite | postgres만 지원)`);
  }
}

export type { DbAdapter, Post, SyncState, PostRelation, PostLang } from "./DbAdapter";
