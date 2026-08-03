export type PostRelation = "tweet" | "retweet" | "like" | "bookmark";

/** 백엔드 GET /api/search 응답의 카드 하나 (검색어 하이라이트 포함) */
export interface SearchHit {
  id: string;
  authorUsername: string;
  text: string;
  lang: string;
  relation: PostRelation;
  createdAt: string;
  savedAt: string;
  url: string;
  retweetOfId: string | null;
  isReply: boolean;
  /** 매칭된 검색어를 <mark>...</mark>로 감싼 본문 (다른 태그는 섞이지 않음) */
  highlightedText: string;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  hasMore: boolean;
}

export interface SearchParams {
  q: string;
  relation?: PostRelation;
  lang?: string;
  limit?: number;
  offset?: number;
}

export class SearchApiError extends Error {}

export async function searchPosts(params: SearchParams): Promise<SearchResult> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.relation) query.set("relation", params.relation);
  if (params.lang) query.set("lang", params.lang);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));

  const response = await fetch(`/api/search?${query.toString()}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new SearchApiError(body?.error ?? "검색 중 오류가 발생했습니다");
  }

  return response.json();
}
