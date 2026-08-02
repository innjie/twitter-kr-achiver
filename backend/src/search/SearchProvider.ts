import type { Post, PostLang, PostRelation } from "../db/DbAdapter";

/**
 * 검색엔진 공통 인터페이스.
 * Meilisearch(기본) / Elasticsearch(선택) 구현체가 동일한 계약을 따르도록 강제한다.
 * .env의 SEARCH_ENGINE 값에 따라 search/index.ts의 팩토리가 알맞은 구현체를 선택한다.
 */

/** X 스타일 고급 검색 문법(from:/since:/until:/lang:/is:)을 파싱한 결과 */
export interface SearchFilters {
  authorUsername?: string;
  since?: Date;
  until?: Date;
  lang?: PostLang;
  relation?: PostRelation;
  /** relation과 별개 축인 답글 여부 (is:reply) */
  isReply?: boolean;
}

export interface SearchResult {
  hits: Post[];
  total: number;
}

export interface SearchProvider {
  /** 인덱스/필터 속성 등 초기 설정 보장. 인증 없이는 실행 불가 (마스터키/비밀번호 검증은 config/env.ts에서 앱 시작 시 강제) */
  connect(): Promise<void>;

  indexDocument(post: Post): Promise<void>;

  /** 아카이브 백필용 bulk 인덱싱 */
  bulkIndexDocuments(posts: Post[]): Promise<void>;

  search(query: string, filters?: SearchFilters): Promise<SearchResult>;
}
