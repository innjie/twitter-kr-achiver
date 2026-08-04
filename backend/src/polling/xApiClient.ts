/**
 * X API v2 폴링 관련 엔드포인트 호출 래퍼.
 * tweets 엔드포인트는 since_id를 지원하지만, liked_tweets/bookmarks는 pagination_token/max_results만
 * 지원하고 since_id/until_id를 지원하지 않는다 (공식 문서 확인 완료) — 이 차이가 pollChannels.ts의
 * 채널별 전략 분기(증분 조회 vs 페이지워크) 이유다.
 */

const API_BASE = "https://api.twitter.com/2";
const MAX_RESULTS = 100;

const TWEET_FIELDS = "created_at,lang,referenced_tweets,in_reply_to_user_id";
const EXPANSIONS = "author_id,referenced_tweets.id,referenced_tweets.id.author_id";
const USER_FIELDS = "username";

export interface XApiReferencedTweet {
  type: "retweeted" | "replied_to" | "quoted";
  id: string;
}

export interface XApiPost {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
  author_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: XApiReferencedTweet[];
}

export interface XApiUser {
  id: string;
  username: string;
}

export interface XApiListResponse {
  data?: XApiPost[];
  /** referenced_tweets.id 확장을 요청하면 참조된 원본 트윗 객체가 여기 함께 담겨 온다 */
  includes?: { users?: XApiUser[]; tweets?: XApiPost[] };
  meta?: { next_token?: string; result_count?: number };
}

export class XApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

export class XApiRateLimitError extends XApiError {
  constructor(
    message: string,
    public readonly resetAt: Date | null,
  ) {
    super(message, 429);
    this.name = "XApiRateLimitError";
  }
}

async function xApiGet(path: string, accessToken: string, params: Record<string, string | undefined>) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 429) {
    const resetHeader = response.headers.get("x-rate-limit-reset");
    const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000) : null;
    throw new XApiRateLimitError("X API rate limit에 도달했습니다", resetAt);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new XApiError(`X API 호출 실패 (${response.status}): ${body}`, response.status);
  }

  return (await response.json()) as XApiListResponse;
}

/** 폴링 대상 계정의 X 사용자 ID를 조회한다 (users/:id/* 엔드포인트에 필요) */
export async function getMe(accessToken: string): Promise<XApiUser> {
  const response = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new XApiError(`X API users/me 호출 실패 (${response.status}): ${body}`, response.status);
  }
  const json = (await response.json()) as { data: XApiUser };
  return json.data;
}

/** GET /2/users/:id/tweets — since_id 기반 증분 조회 지원 */
export async function listTweets(
  accessToken: string,
  userId: string,
  options: { sinceId?: string; paginationToken?: string },
): Promise<XApiListResponse> {
  return xApiGet(`/users/${userId}/tweets`, accessToken, {
    max_results: String(MAX_RESULTS),
    "tweet.fields": TWEET_FIELDS,
    expansions: EXPANSIONS,
    "user.fields": USER_FIELDS,
    since_id: options.sinceId,
    pagination_token: options.paginationToken,
  });
}

/** GET /2/users/:id/liked_tweets — since_id 미지원, pagination_token으로만 페이지 이동 */
export async function listLikedTweets(
  accessToken: string,
  userId: string,
  options: { paginationToken?: string },
): Promise<XApiListResponse> {
  return xApiGet(`/users/${userId}/liked_tweets`, accessToken, {
    max_results: String(MAX_RESULTS),
    "tweet.fields": TWEET_FIELDS,
    expansions: EXPANSIONS,
    "user.fields": USER_FIELDS,
    pagination_token: options.paginationToken,
  });
}

/** GET /2/users/:id/bookmarks — since_id 미지원, pagination_token으로만 페이지 이동 */
export async function listBookmarks(
  accessToken: string,
  userId: string,
  options: { paginationToken?: string },
): Promise<XApiListResponse> {
  return xApiGet(`/users/${userId}/bookmarks`, accessToken, {
    max_results: String(MAX_RESULTS),
    "tweet.fields": TWEET_FIELDS,
    expansions: EXPANSIONS,
    "user.fields": USER_FIELDS,
    pagination_token: options.paginationToken,
  });
}
