import type { Post } from "../../db/DbAdapter";
import type { SearchFilters, SearchPagination, SearchProvider, SearchResult } from "../SearchProvider";

/**
 * Elasticsearch 어댑터 (선택 검색엔진).
 * 언어별 필드(text_ko/text_ja/text_zh 등)에 Nori/Kuromoji/SmartCN analyzer를 매핑해야 하며,
 * 문서의 lang 필드를 기준으로 어떤 필드에 색인할지 분기하는 로직이 필요하다 (추후 구현).
 * 실제 클라이언트 호출/인덱스 매핑 로직은 아직 구현하지 않은 뼈대 상태.
 */
export class ElasticsearchAdapter implements SearchProvider {
  constructor(
    private readonly host: string,
    private readonly password: string,
  ) {}

  async connect(): Promise<void> {
    throw new Error("ElasticsearchAdapter.connect: not implemented yet");
  }

  async indexDocument(post: Post): Promise<void> {
    throw new Error("ElasticsearchAdapter.indexDocument: not implemented yet");
  }

  async bulkIndexDocuments(posts: Post[]): Promise<void> {
    throw new Error("ElasticsearchAdapter.bulkIndexDocuments: not implemented yet");
  }

  async search(query: string, filters?: SearchFilters, pagination?: SearchPagination): Promise<SearchResult> {
    throw new Error("ElasticsearchAdapter.search: not implemented yet");
  }
}
