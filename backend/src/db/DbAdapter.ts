/**
 * DB 어댑터 공통 인터페이스.
 * SQLite(기본) / Postgres(선택) 구현체가 동일한 스키마·계약을 따르도록 강제한다.
 * .env의 DB_TYPE 값에 따라 db/index.ts의 팩토리가 알맞은 구현체를 선택한다.
 */

export type PostRelation = "tweet" | "retweet" | "like" | "bookmark";
export type PostLang = "ko" | "en" | "ja" | "zh" | string;
export type PostSource = "archive_import" | "api_poll";

/** X API v2의 폴링 엔드포인트 단위. posts.relation과는 다른 축 (tweets 엔드포인트는 tweet/retweet을 함께 반환). */
export type SyncChannel = "tweets" | "likes" | "bookmarks";

export interface Post {
  id: string;
  authorUsername: string;
  text: string;
  lang: PostLang;
  relation: PostRelation;
  createdAt: Date;
  savedAt: Date;
  url: string;
  /**
   * 리트윗인 경우 원본 트윗(posts.id) 참조. 리트윗이 아니면 null.
   * FK로 강제되지 않음: 원본은 대개 타인의 트윗이라 우리 posts에 실제로 존재하지 않는 경우가 정상.
   */
  retweetOfId: string | null;
  source: PostSource;
}

export interface SyncState {
  channel: SyncChannel;
  lastSyncedId: string | null;
  updatedAt: Date;
}

export interface OAuthToken {
  /** 암호화된 상태로 저장/조회 (TOKEN_ENCRYPTION_KEY 사용, 평문 보관 금지) */
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  updatedAt: Date;
}

export interface DbAdapter {
  /** 연결 초기화 및 스키마 마이그레이션 보장 */
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** 단건 insert (런타임 폴링용) */
  insertPost(post: Post): Promise<void>;

  /** 배치 insert (아카이브 백필용, 1,000건 단위 트랜잭션 권장) */
  batchInsertPosts(posts: Post[]): Promise<void>;

  getSyncState(channel: SyncChannel): Promise<SyncState>;
  setLastSyncedId(channel: SyncChannel, id: string): Promise<void>;

  getOAuthToken(): Promise<OAuthToken | null>;
  saveOAuthToken(token: OAuthToken): Promise<void>;
}
