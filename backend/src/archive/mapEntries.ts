import type { Post } from "../db/DbAdapter";

/**
 * X 공식 아카이브 tweet.js/like.js의 원소 형태 (best-effort 타입).
 * 아카이브 포맷은 X 측 변경에 따라 달라질 수 있어, 아래 필드는 옵셔널로 방어적으로 다룬다.
 * 실제 다운로드한 아카이브로 검증 전이므로 필드 누락 시 조용히 skip하고 예외를 던지지 않는다.
 */
interface RawTweetEntry {
  tweet?: {
    id_str?: string;
    id?: string;
    full_text?: string;
    text?: string;
    created_at?: string; // 예: "Wed Oct 10 20:19:24 +0000 2018"
    lang?: string;
    in_reply_to_status_id_str?: string;
    in_reply_to_status_id?: string;
    retweeted_status?: {
      id_str?: string;
      id?: string;
      user?: { screen_name?: string };
    };
  };
}

interface RawLikeEntry {
  like?: {
    tweetId?: string;
    fullText?: string;
    expandedUrl?: string;
  };
}

const RETWEET_PREFIX = /^RT @(\w+):/;
const STATUS_URL_AUTHOR = /(?:twitter|x)\.com\/([^/]+)\/status\//i;

/** X 아카이브의 created_at 형식("Wed Oct 10 20:19:24 +0000 2018")을 Date로 변환 */
function parseArchiveDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * tweet.js 원소 하나를 Post로 매핑한다.
 * @param ownUsername 아카이브 소유자의 X 아이디. 아카이브 자체에는 이 정보가 없어 업로드 시 사용자가 직접 입력한 값을 받는다.
 * @returns 필수 필드가 없으면 null (스킵)
 */
export function mapTweetEntry(raw: unknown, ownUsername: string, savedAt: Date): Post | null {
  const entry = raw as RawTweetEntry;
  const tweet = entry?.tweet;
  if (!tweet) return null;

  const id = tweet.id_str ?? tweet.id;
  const text = tweet.full_text ?? tweet.text;
  if (!id || !text) return null;

  const createdAt = parseArchiveDate(tweet.created_at) ?? savedAt;

  const retweetMatch = text.match(RETWEET_PREFIX);
  const isRetweet = Boolean(tweet.retweeted_status) || Boolean(retweetMatch);

  const retweetOfId = tweet.retweeted_status?.id_str ?? tweet.retweeted_status?.id ?? null;
  const retweetAuthor = tweet.retweeted_status?.user?.screen_name ?? retweetMatch?.[1] ?? null;
  const isReply = Boolean(tweet.in_reply_to_status_id_str ?? tweet.in_reply_to_status_id);

  return {
    id,
    authorUsername: isRetweet ? (retweetAuthor ?? ownUsername) : ownUsername,
    text,
    lang: tweet.lang ?? "",
    relation: isRetweet ? "retweet" : "tweet",
    createdAt,
    savedAt,
    url: `https://x.com/${ownUsername}/status/${id}`,
    retweetOfId,
    isReply,
    source: "archive_import",
  };
}

/**
 * like.js 원소 하나를 Post로 매핑한다.
 * 주의: X 아카이브의 like.js에는 좋아요를 누른 시각이 포함되지 않는다.
 * 정확한 좋아요 시각은 알 수 없지만, like.js 배열 순서가 대체로 최신→과거 흐름을 따르는 것으로
 * 실제 데이터에서 확인됨(claude/rules/backend.md TODO #17 참고) — 배열 인덱스를 이용해
 * "실제 날짜는 아니지만 상대적 최신순 정렬은 가능한" 합성 createdAt을 만든다.
 * @param orderIndex like.js 배열에서의 순서(0 = 가장 최근으로 간주). savedAt에서 1초씩 차감해 정렬용 유일값 생성
 * @returns 필수 필드가 없으면 null (스킵)
 */
export function mapLikeEntry(raw: unknown, savedAt: Date, orderIndex: number): Post | null {
  const entry = raw as RawLikeEntry;
  const like = entry?.like;
  if (!like?.tweetId) return null;

  const authorMatch = like.expandedUrl?.match(STATUS_URL_AUTHOR);
  const url = like.expandedUrl ?? `https://x.com/i/web/status/${like.tweetId}`;
  const createdAt = new Date(savedAt.getTime() - orderIndex * 1000);

  return {
    id: like.tweetId,
    authorUsername: authorMatch?.[1] ?? "unknown",
    text: like.fullText ?? "",
    lang: "",
    relation: "like",
    createdAt,
    savedAt,
    url,
    retweetOfId: null,
    // like.js에는 답글 여부 정보가 없음
    isReply: false,
    source: "archive_import",
  };
}
