import { MeiliSearch, type Index } from "meilisearch";
import type { Post, PostLang, PostRelation, PostSource } from "../../db/DbAdapter";
import type { SearchFilters, SearchHit, SearchPagination, SearchProvider, SearchResult } from "../SearchProvider";

const INDEX_UID = "posts";
const FILTERABLE_ATTRIBUTES = ["authorUsername", "lang", "relation", "createdAt", "isReply"];
const SORTABLE_ATTRIBUTES = ["createdAt"];
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_OFFSET = 0;
// mark 태그만 사용 — 프론트에서 dangerouslySetInnerHTML 없이 태그 구간만 파싱해 안전하게 렌더링한다 (XSS 방지)
const HIGHLIGHT_PRE_TAG = "<mark>";
const HIGHLIGHT_POST_TAG = "</mark>";

/** Meilisearch에 저장하는 문서 형태. Date는 필터/정렬을 위해 unix seconds(숫자)로 변환해 저장한다. */
interface MeiliPostDocument {
  /** 인덱스 primaryKey. 같은 트윗 id가 tweet/retweet/like/bookmark로 동시에 존재할 수 있어(예: 본인 트윗을 본인이 좋아요) `relation:id` 합성값을 사용 */
  docId: string;
  id: string;
  authorUsername: string;
  text: string;
  lang: string;
  relation: string;
  createdAt: number;
  savedAt: number;
  url: string;
  retweetOfId: string | null;
  isReply: boolean;
  source: string;
}

function toMeiliDocument(post: Post): MeiliPostDocument {
  return {
    docId: `${post.relation}_${post.id}`,
    id: post.id,
    authorUsername: post.authorUsername,
    text: post.text,
    lang: post.lang,
    relation: post.relation,
    createdAt: Math.floor(post.createdAt.getTime() / 1000),
    savedAt: Math.floor(post.savedAt.getTime() / 1000),
    url: post.url,
    retweetOfId: post.retweetOfId,
    isReply: post.isReply,
    source: post.source,
  };
}

function fromMeiliDocument(doc: MeiliPostDocument): Post {
  return {
    id: doc.id,
    authorUsername: doc.authorUsername,
    text: doc.text,
    lang: doc.lang as PostLang,
    relation: doc.relation as PostRelation,
    createdAt: new Date(doc.createdAt * 1000),
    savedAt: new Date(doc.savedAt * 1000),
    url: doc.url,
    retweetOfId: doc.retweetOfId,
    isReply: doc.isReply,
    source: doc.source as PostSource,
  };
}

/** Meilisearch 필터 문법에 안전하게 넣기 위해 문자열 값을 JSON 문자열로 이스케이프 */
function quoteFilterValue(value: string): string {
  return JSON.stringify(value);
}

function buildFilterExpression(filters?: SearchFilters): string | undefined {
  if (!filters) return undefined;

  const clauses: string[] = [];
  if (filters.authorUsername) {
    clauses.push(`authorUsername = ${quoteFilterValue(filters.authorUsername)}`);
  }
  if (filters.lang) {
    clauses.push(`lang = ${quoteFilterValue(filters.lang)}`);
  }
  if (filters.relation) {
    clauses.push(`relation = ${quoteFilterValue(filters.relation)}`);
  }
  if (filters.since) {
    clauses.push(`createdAt >= ${Math.floor(filters.since.getTime() / 1000)}`);
  }
  if (filters.until) {
    clauses.push(`createdAt <= ${Math.floor(filters.until.getTime() / 1000)}`);
  }
  if (filters.isReply !== undefined) {
    clauses.push(`isReply = ${filters.isReply}`);
  }

  return clauses.length > 0 ? clauses.join(" AND ") : undefined;
}

/**
 * Meilisearch 어댑터 (기본 검색엔진).
 * 다국어(한/영/일/중) 토크나이징은 Charabia가 자동 처리하므로 별도 언어 분기 불필요.
 */
export class MeilisearchAdapter implements SearchProvider {
  private client: MeiliSearch | null = null;

  constructor(
    private readonly host: string,
    private readonly masterKey: string,
  ) {}

  private get index(): Index<MeiliPostDocument> {
    if (!this.client) {
      throw new Error("MeilisearchAdapter: connect()를 먼저 호출해야 합니다");
    }
    return this.client.index<MeiliPostDocument>(INDEX_UID);
  }

  async connect(): Promise<void> {
    this.client = new MeiliSearch({ host: this.host, apiKey: this.masterKey });

    const exists = await this.client
      .getIndex(INDEX_UID)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      const createTask = await this.client.createIndex(INDEX_UID, { primaryKey: "docId" });
      await this.client.tasks.waitForTask(createTask.taskUid);
    }

    const filterTask = await this.index.updateFilterableAttributes(FILTERABLE_ATTRIBUTES);
    const sortTask = await this.index.updateSortableAttributes(SORTABLE_ATTRIBUTES);
    await this.client.tasks.waitForTasks([filterTask.taskUid, sortTask.taskUid]);
  }

  async indexDocument(post: Post): Promise<void> {
    await this.index.addDocuments([toMeiliDocument(post)]);
  }

  async bulkIndexDocuments(posts: Post[]): Promise<void> {
    if (posts.length === 0) return;
    await this.index.addDocumentsInBatches(posts.map(toMeiliDocument), 1000);
  }

  async search(
    query: string,
    filters?: SearchFilters,
    pagination?: SearchPagination,
  ): Promise<SearchResult> {
    const limit = pagination?.limit ?? DEFAULT_SEARCH_LIMIT;
    const offset = pagination?.offset ?? DEFAULT_SEARCH_OFFSET;

    const response = await this.index.search(query, {
      filter: buildFilterExpression(filters),
      limit,
      offset,
      attributesToHighlight: ["text"],
      highlightPreTag: HIGHLIGHT_PRE_TAG,
      highlightPostTag: HIGHLIGHT_POST_TAG,
    });

    const hits: SearchHit[] = response.hits.map((hit) => {
      const post = fromMeiliDocument(hit);
      const formattedText = hit._formatted?.text;
      return { ...post, highlightedText: formattedText ?? post.text };
    });

    const total = response.estimatedTotalHits ?? offset + hits.length;

    return {
      hits,
      total,
      hasMore: offset + hits.length < total,
    };
  }
}
