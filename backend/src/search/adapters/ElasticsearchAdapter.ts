import { Client } from "@elastic/elasticsearch";
import type { Post, PostLang, PostRelation, PostSource } from "../../db/DbAdapter";
import type { SearchFilters, SearchHit, SearchPagination, SearchProvider, SearchResult } from "../SearchProvider";

const INDEX_NAME = "posts";
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_OFFSET = 0;
// mark 태그만 사용 — 프론트에서 dangerouslySetInnerHTML 없이 태그 구간만 파싱해 안전하게 렌더링한다 (XSS 방지)
const HIGHLIGHT_PRE_TAG = "<mark>";
const HIGHLIGHT_POST_TAG = "</mark>";

/** lang 값 → 형태소 분석기가 매핑된 필드. 매핑 없는 언어(en 등)는 "text"(standard analyzer) 폴백 */
const LANG_TEXT_FIELD: Record<string, string> = {
  ko: "text_ko",
  ja: "text_ja",
  zh: "text_zh",
};
const ALL_TEXT_FIELDS = ["text_ko", "text_ja", "text_zh", "text"];

function textFieldForLang(lang: string): string {
  return LANG_TEXT_FIELD[lang] ?? "text";
}

/** Elasticsearch에 저장하는 문서 형태. 본문은 lang에 따라 언어별 필드 중 하나에만 채워진다. */
interface EsPostDocument {
  id: string;
  authorUsername: string;
  text_ko?: string;
  text_ja?: string;
  text_zh?: string;
  text?: string;
  lang: string;
  relation: string;
  createdAt: string;
  savedAt: string;
  url: string;
  retweetOfId: string | null;
  isReply: boolean;
  source: string;
}

function toEsDocument(post: Post): EsPostDocument {
  const base = {
    id: post.id,
    authorUsername: post.authorUsername,
    lang: post.lang,
    relation: post.relation,
    createdAt: post.createdAt.toISOString(),
    savedAt: post.savedAt.toISOString(),
    url: post.url,
    retweetOfId: post.retweetOfId,
    isReply: post.isReply,
    source: post.source,
  };
  return { ...base, [textFieldForLang(post.lang)]: post.text } as EsPostDocument;
}

function fromEsDocument(doc: EsPostDocument): Post {
  return {
    id: doc.id,
    authorUsername: doc.authorUsername,
    text: doc.text_ko ?? doc.text_ja ?? doc.text_zh ?? doc.text ?? "",
    lang: doc.lang as PostLang,
    relation: doc.relation as PostRelation,
    createdAt: new Date(doc.createdAt),
    savedAt: new Date(doc.savedAt),
    url: doc.url,
    retweetOfId: doc.retweetOfId,
    isReply: doc.isReply,
    source: doc.source as PostSource,
  };
}

/** lang 필터가 있으면 해당 언어 필드만, 없으면 전체 언어 필드를 검색 대상으로 삼는다 */
function targetFieldsForFilters(filters?: SearchFilters): string[] {
  if (filters?.lang) {
    return [textFieldForLang(filters.lang)];
  }
  return ALL_TEXT_FIELDS;
}

function buildEsQuery(query: string, filters: SearchFilters | undefined, fields: string[]): object {
  const filterClauses: object[] = [];
  if (filters?.authorUsername) {
    filterClauses.push({ term: { authorUsername: filters.authorUsername } });
  }
  if (filters?.lang) {
    filterClauses.push({ term: { lang: filters.lang } });
  }
  if (filters?.relation) {
    filterClauses.push({ term: { relation: filters.relation } });
  }
  if (filters?.isReply !== undefined) {
    filterClauses.push({ term: { isReply: filters.isReply } });
  }
  if (filters?.since || filters?.until) {
    const range: Record<string, string> = {};
    if (filters.since) range.gte = filters.since.toISOString();
    if (filters.until) range.lte = filters.until.toISOString();
    filterClauses.push({ range: { createdAt: range } });
  }

  const must = query.trim()
    ? [{ multi_match: { query, fields, type: "best_fields" } }]
    : [{ match_all: {} }];

  return { bool: { must, filter: filterClauses } };
}

/**
 * Elasticsearch 어댑터 (선택 검색엔진).
 * lang 필드 기준으로 언어별 필드(text_ko/text_ja/text_zh, 그 외는 text)에 색인하며,
 * 각 필드에 Nori/Kuromoji/SmartCN analyzer를 매핑한다 (docker/elasticsearch.Dockerfile 참고).
 */
export class ElasticsearchAdapter implements SearchProvider {
  private client: Client | null = null;

  constructor(
    private readonly host: string,
    private readonly username: string,
    private readonly password: string,
  ) {}

  private get esClient(): Client {
    if (!this.client) {
      throw new Error("ElasticsearchAdapter: connect()를 먼저 호출해야 합니다");
    }
    return this.client;
  }

  async connect(): Promise<void> {
    this.client = new Client({
      node: this.host,
      auth: { username: this.username, password: this.password },
      // 로컬 단일 노드 구성의 자체 서명 인증서 허용. 포트가 127.0.0.1에만 바인딩되고
      // ELASTIC_PASSWORD 인증이 앱 시작 시 필수로 강제되므로(config/env.ts) 허용 가능한 트레이드오프.
      tls: { rejectUnauthorized: false },
    });

    const exists = await this.client.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await this.client.indices.create({
        index: INDEX_NAME,
        mappings: {
          properties: {
            id: { type: "keyword" },
            authorUsername: { type: "keyword" },
            text_ko: { type: "text", analyzer: "nori" },
            text_ja: { type: "text", analyzer: "kuromoji" },
            text_zh: { type: "text", analyzer: "smartcn" },
            text: { type: "text" },
            lang: { type: "keyword" },
            relation: { type: "keyword" },
            createdAt: { type: "date" },
            savedAt: { type: "date" },
            url: { type: "keyword", index: false },
            retweetOfId: { type: "keyword" },
            isReply: { type: "boolean" },
            source: { type: "keyword" },
          },
        },
      });
    }
  }

  async indexDocument(post: Post): Promise<void> {
    await this.esClient.index({ index: INDEX_NAME, id: post.id, document: toEsDocument(post) });
  }

  async bulkIndexDocuments(posts: Post[]): Promise<void> {
    if (posts.length === 0) return;
    await this.esClient.helpers.bulk({
      datasource: posts,
      onDocument: (post) => [{ index: { _index: INDEX_NAME, _id: post.id } }, toEsDocument(post)],
      onDrop: (doc) => {
        throw new Error(`ElasticsearchAdapter bulk index 실패: ${JSON.stringify(doc)}`);
      },
    });
  }

  async search(
    query: string,
    filters?: SearchFilters,
    pagination?: SearchPagination,
  ): Promise<SearchResult> {
    const limit = pagination?.limit ?? DEFAULT_SEARCH_LIMIT;
    const offset = pagination?.offset ?? DEFAULT_SEARCH_OFFSET;
    const fields = targetFieldsForFilters(filters);

    const response = await this.esClient.search<EsPostDocument>({
      index: INDEX_NAME,
      from: offset,
      size: limit,
      query: buildEsQuery(query, filters, fields),
      highlight: {
        fields: Object.fromEntries(fields.map((field) => [field, {}])),
        pre_tags: [HIGHLIGHT_PRE_TAG],
        post_tags: [HIGHLIGHT_POST_TAG],
      },
    });

    const hits: SearchHit[] = response.hits.hits.flatMap((hit) => {
      if (!hit._source) return [];
      const post = fromEsDocument(hit._source);
      const highlighted = hit.highlight ? Object.values(hit.highlight)[0]?.[0] : undefined;
      return [{ ...post, highlightedText: highlighted ?? post.text }];
    });

    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? offset + hits.length);

    return {
      hits,
      total,
      hasMore: offset + hits.length < total,
    };
  }
}
