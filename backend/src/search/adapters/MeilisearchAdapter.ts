import type { Post } from "../../db/DbAdapter";
import type { SearchFilters, SearchProvider, SearchResult } from "../SearchProvider";

/**
 * Meilisearch 어댑터 (기본 검색엔진).
 * 다국어(한/영/일/중) 토크나이징은 Charabia가 자동 처리하므로 별도 언어 분기 불필요.
 * 실제 클라이언트 호출/인덱스 설정 로직은 아직 구현하지 않은 뼈대 상태.
 */
export class MeilisearchAdapter implements SearchProvider {
  constructor(
    private readonly host: string,
    private readonly masterKey: string,
  ) {}

  async indexDocument(post: Post): Promise<void> {
    throw new Error("MeilisearchAdapter.indexDocument: not implemented yet");
  }

  async bulkIndexDocuments(posts: Post[]): Promise<void> {
    throw new Error("MeilisearchAdapter.bulkIndexDocuments: not implemented yet");
  }

  async search(query: string, filters?: SearchFilters): Promise<SearchResult> {
    throw new Error("MeilisearchAdapter.search: not implemented yet");
  }
}
