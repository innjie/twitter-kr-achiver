/**
 * DB 어댑터 공통 인터페이스.
 * SQLite(기본) / Postgres(선택) 구현체가 동일한 스키마·계약을 따르도록 강제한다.
 * .env의 DB_TYPE 값에 따라 db/index.ts의 팩토리가 알맞은 구현체를 선택한다.
 */

export type PostRelation = "tweet" | "retweet" | "like" | "bookmark";
export type PostLang = "ko" | "en" | "ja" | "zh" | string;

export interface Post {
  id: string;
  authorUsername: string;
  text: string;
  lang: PostLang;
  relation: PostRelation;
  createdAt: Date;
}

export interface SyncState {
  lastSyncedId: string | null;
}

export interface DbAdapter {
  /** 연결 초기화 및 스키마 마이그레이션 보장 */
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** 단건 insert (런타임 폴링용) */
  insertPost(post: Post): Promise<void>;

  /** 배치 insert (아카이브 백필용, 1,000건 단위 트랜잭션 권장) */
  batchInsertPosts(posts: Post[]): Promise<void>;

  getSyncState(): Promise<SyncState>;
  setLastSyncedId(id: string): Promise<void>;
}
