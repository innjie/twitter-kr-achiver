import type { DbAdapter, Post, SyncChannel } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { getMe, listBookmarks, listLikedTweets, listTweets, type XApiListResponse } from "./xApiClient";
import { buildLookups, mapApiRelationEntry, mapApiTweetEntry } from "./mapApiEntry";

/** likes/bookmarks는 since_id를 지원하지 않아 페이지워크로 신규분을 찾는다. 폭주 방지용 안전 상한. */
const MAX_PAGES_PER_CYCLE = 10;

async function flush(db: DbAdapter, search: SearchProvider, posts: Post[]): Promise<void> {
  if (posts.length === 0) return;
  await db.batchInsertPosts(posts);
  await search.bulkIndexDocuments(posts);
}

/**
 * tweets 채널: sync_state.last_synced_id를 since_id로 사용해 신규분만 증분 조회한다.
 * 완료 후 이번에 조회된 것 중 가장 최신 id로 last_synced_id를 갱신한다.
 */
async function pollTweetsChannel(
  db: DbAdapter,
  search: SearchProvider,
  accessToken: string,
  userId: string,
  ownUsername: string,
): Promise<number> {
  const syncState = await db.getSyncState("tweets");
  const savedAt = new Date();

  let paginationToken: string | undefined;
  let newestId: string | null = null;
  let total = 0;

  do {
    const response: XApiListResponse = await listTweets(accessToken, userId, {
      sinceId: syncState.lastSyncedId ?? undefined,
      paginationToken,
    });

    const lookups = buildLookups(response);
    const posts = (response.data ?? []).map((raw) => mapApiTweetEntry(raw, lookups, ownUsername, savedAt));
    await flush(db, search, posts);
    total += posts.length;

    if (posts.length > 0 && newestId === null) {
      // X API는 최신순으로 내려주므로 첫 페이지 첫 항목이 이번 폴링의 최신 id
      newestId = posts[0].id;
    }

    paginationToken = response.meta?.next_token;
  } while (paginationToken);

  if (newestId) {
    await db.setLastSyncedId("tweets", newestId);
  }

  return total;
}

/**
 * likes/bookmarks 채널: since_id 미지원이라 최신 페이지부터 훑다가 마지막으로 저장된 id를 만나면 중단한다.
 * 완료 후 이번에 조회된 것 중 가장 최신 id를 "어디까지 봤는지" 마커로 last_synced_id에 저장한다
 * (since_id로는 쓰이지 않고, 다음 폴링에서 페이지워크를 멈출 기준으로만 쓰임).
 */
async function pollRelationChannel(
  db: DbAdapter,
  search: SearchProvider,
  channel: Extract<SyncChannel, "likes" | "bookmarks">,
  relation: "like" | "bookmark",
  fetchPage: (paginationToken: string | undefined) => Promise<XApiListResponse>,
): Promise<number> {
  const syncState = await db.getSyncState(channel);
  const savedAt = new Date();

  let paginationToken: string | undefined;
  let newestId: string | null = null;
  let total = 0;
  let pageCount = 0;
  let reachedLastSynced = false;

  do {
    const response = await fetchPage(paginationToken);
    pageCount++;

    const lookups = buildLookups(response);
    const rawItems = response.data ?? [];

    const boundaryIndex = syncState.lastSyncedId
      ? rawItems.findIndex((item) => item.id === syncState.lastSyncedId)
      : -1;
    const newItems = boundaryIndex === -1 ? rawItems : rawItems.slice(0, boundaryIndex);
    if (boundaryIndex !== -1) {
      reachedLastSynced = true;
    }

    const posts = newItems.map((raw) => mapApiRelationEntry(raw, lookups, relation, savedAt));
    await flush(db, search, posts);
    total += posts.length;

    if (posts.length > 0 && newestId === null) {
      newestId = posts[0].id;
    }

    paginationToken = response.meta?.next_token;
  } while (paginationToken && !reachedLastSynced && pageCount < MAX_PAGES_PER_CYCLE);

  if (newestId) {
    await db.setLastSyncedId(channel, newestId);
  }

  return total;
}

export interface PollResult {
  tweets: number;
  likes: number;
  bookmarks: number;
}

/** 세 채널(tweets/likes/bookmarks)을 순서대로 폴링한다. 채널 하나가 실패해도 나머지는 계속 진행한다. */
export async function pollAllChannels(
  db: DbAdapter,
  search: SearchProvider,
  accessToken: string,
): Promise<PollResult> {
  const me = await getMe(accessToken);
  const result: PollResult = { tweets: 0, likes: 0, bookmarks: 0 };

  try {
    result.tweets = await pollTweetsChannel(db, search, accessToken, me.id, me.username);
  } catch (err) {
    console.error("[polling] tweets 채널 폴링 실패:", err);
  }

  try {
    result.likes = await pollRelationChannel(db, search, "likes", "like", (paginationToken) =>
      listLikedTweets(accessToken, me.id, { paginationToken }),
    );
  } catch (err) {
    console.error("[polling] likes 채널 폴링 실패:", err);
  }

  try {
    result.bookmarks = await pollRelationChannel(db, search, "bookmarks", "bookmark", (paginationToken) =>
      listBookmarks(accessToken, me.id, { paginationToken }),
    );
  } catch (err) {
    console.error("[polling] bookmarks 채널 폴링 실패:", err);
  }

  return result;
}
