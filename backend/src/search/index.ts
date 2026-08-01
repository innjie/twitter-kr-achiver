import type { SearchProvider } from "./SearchProvider";
import { MeilisearchAdapter } from "./adapters/MeilisearchAdapter";
import { ElasticsearchAdapter } from "./adapters/ElasticsearchAdapter";

/**
 * .env의 SEARCH_ENGINE(meilisearch | elasticsearch)에 따라 어댑터를 선택하는 팩토리.
 * 인증 필수 값(MEILI_MASTER_KEY / ELASTIC_PASSWORD) 존재 여부는 config/env.ts가
 * 앱 시작 시점에 먼저 검증하므로, 여기서는 이미 유효하다고 가정한다.
 */
export function createSearchProvider(): SearchProvider {
  const engine = process.env.SEARCH_ENGINE ?? "meilisearch";

  switch (engine) {
    case "meilisearch":
      return new MeilisearchAdapter(
        process.env.MEILI_HOST ?? "http://127.0.0.1:7700",
        process.env.MEILI_MASTER_KEY ?? "",
      );
    case "elasticsearch":
      return new ElasticsearchAdapter(
        process.env.ELASTIC_HOST ?? "https://127.0.0.1:9200",
        process.env.ELASTIC_PASSWORD ?? "",
      );
    default:
      throw new Error(`알 수 없는 SEARCH_ENGINE: ${engine} (meilisearch | elasticsearch만 지원)`);
  }
}

export type { SearchProvider, SearchFilters, SearchResult } from "./SearchProvider";
