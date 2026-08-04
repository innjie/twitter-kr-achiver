import type { Post, PostRelation } from "../db/DbAdapter";
import type { XApiListResponse, XApiPost, XApiUser } from "./xApiClient";

/**
 * X API v2가 반환하는 includes.users/includes.tweets를 id 기준으로 빠르게 찾기 위한 룩업 테이블.
 * XApiListResponse는 tweet.fields에 대응하는 필드만 갖지만, includes.tweets에 들어오는 참조된 원본
 * 트윗 객체도 동일한 XApiPost 형태이므로 타입을 재사용한다.
 */
interface XApiLookups {
  usersById: Map<string, XApiUser>;
  tweetsById: Map<string, XApiPost>;
}

export function buildLookups(response: XApiListResponse): XApiLookups {
  const usersById = new Map<string, XApiUser>();
  for (const user of response.includes?.users ?? []) {
    usersById.set(user.id, user);
  }

  const tweetsById = new Map<string, XApiPost>();
  for (const tweet of response.includes?.tweets ?? []) {
    tweetsById.set(tweet.id, tweet);
  }

  return { usersById, tweetsById };
}

function resolveIsReply(raw: XApiPost): boolean {
  return raw.referenced_tweets?.some((ref) => ref.type === "replied_to") ?? Boolean(raw.in_reply_to_user_id);
}

/**
 * tweets 채널(GET /2/users/:id/tweets) 항목 하나를 Post로 매핑한다.
 * 리트윗 항목은 top-level author_id가 "리트윗한 사용자"(=본인)이고, 원문 텍스트는 잘려서 내려오는
 * v2 API 특성이 있어 — referenced_tweets(type=retweeted)로 원본 트윗 id를 찾고,
 * includes.tweets/includes.users에서 원본 텍스트/작성자를 다시 조회한다.
 * @param ownUsername 폴링 대상 계정의 X 아이디 (getMe()로 조회한 값)
 */
export function mapApiTweetEntry(
  raw: XApiPost,
  lookups: XApiLookups,
  ownUsername: string,
  savedAt: Date,
): Post {
  const retweetedRef = raw.referenced_tweets?.find((ref) => ref.type === "retweeted");
  const createdAt = raw.created_at ? new Date(raw.created_at) : savedAt;

  if (retweetedRef) {
    const originalTweet = lookups.tweetsById.get(retweetedRef.id);
    const originalAuthor = originalTweet?.author_id ? lookups.usersById.get(originalTweet.author_id) : undefined;

    return {
      id: raw.id,
      authorUsername: originalAuthor?.username ?? ownUsername,
      text: originalTweet?.text ?? raw.text,
      lang: raw.lang ?? "",
      relation: "retweet",
      createdAt,
      savedAt,
      url: `https://x.com/${ownUsername}/status/${raw.id}`,
      retweetOfId: retweetedRef.id,
      isReply: resolveIsReply(raw),
      source: "api_poll",
    };
  }

  return {
    id: raw.id,
    authorUsername: ownUsername,
    text: raw.text,
    lang: raw.lang ?? "",
    relation: "tweet",
    createdAt,
    savedAt,
    url: `https://x.com/${ownUsername}/status/${raw.id}`,
    retweetOfId: null,
    isReply: resolveIsReply(raw),
    source: "api_poll",
  };
}

/**
 * likes/bookmarks 채널 항목 하나를 Post로 매핑한다.
 * 대상 트윗은 대개 타인의 글이라 authorUsername을 includes.users에서 조회한다.
 * retweetOfId는 Post 스키마상 relation=retweet 전용 필드라 항상 null로 둔다.
 */
export function mapApiRelationEntry(
  raw: XApiPost,
  lookups: XApiLookups,
  relation: Extract<PostRelation, "like" | "bookmark">,
  savedAt: Date,
): Post {
  const author = raw.author_id ? lookups.usersById.get(raw.author_id) : undefined;
  const authorUsername = author?.username ?? "unknown";

  return {
    id: raw.id,
    authorUsername,
    text: raw.text,
    lang: raw.lang ?? "",
    relation,
    createdAt: raw.created_at ? new Date(raw.created_at) : savedAt,
    savedAt,
    url: `https://x.com/${authorUsername}/status/${raw.id}`,
    retweetOfId: null,
    isReply: resolveIsReply(raw),
    source: "api_poll",
  };
}
