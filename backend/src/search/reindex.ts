import type { DbAdapter } from "../db/DbAdapter";
import type { SearchProvider } from "./SearchProvider";

const REINDEX_PAGE_SIZE = 1000;

/**
 * DB의 posts 전체를 검색엔진에 다시 색인한다.
 * 검색엔진 전환(SEARCH_ENGINE 변경) 후 기존 인덱스에는 데이터가 없으므로 수동으로 호출해야 한다.
 * indexDocument/bulkIndexDocuments는 id 기준 upsert라 이미 색인된 문서를 다시 넣어도 안전하다.
 */
export async function reindexAll(db: DbAdapter, search: SearchProvider): Promise<{ indexed: number }> {
  let offset = 0;
  let indexed = 0;

  while (true) {
    const page = await db.getPostsPage(offset, REINDEX_PAGE_SIZE);
    if (page.length === 0) break;

    await search.bulkIndexDocuments(page);
    indexed += page.length;
    offset += page.length;

    if (page.length < REINDEX_PAGE_SIZE) break;
  }

  return { indexed };
}
