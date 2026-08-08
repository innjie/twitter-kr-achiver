import * as unzipper from "unzipper";
import type { DbAdapter, Post } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { streamArchiveJsonArray } from "./streamJsonArray";
import { mapLikeEntry, mapTweetEntry } from "./mapEntries";

const TWEET_FILE_PATTERN = /^data\/tweets?(-part\d+)?\.js$/i;
const LIKE_FILE_PATTERN = /^data\/like(-part\d+)?\.js$/i;
// 참고: X 공식 데이터 아카이브는 현재 북마크를 포함하지 않는다 (docs/06_개발가이드.md §5-2)

const BATCH_SIZE = 1000;

export interface ImportSummary {
  tweetsImported: number;
  tweetsSkipped: number;
  likesImported: number;
  likesSkipped: number;
  filesProcessed: string[];
}

async function importEntries(
  db: DbAdapter,
  search: SearchProvider,
  files: unzipper.File[],
  mapEntry: (raw: unknown, index: number) => Post | null,
): Promise<{ imported: number; skipped: number; maxId: bigint }> {
  let imported = 0;
  let skipped = 0;
  let maxId = 0n;
  let index = 0;
  let batch: Post[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    await db.batchInsertPosts(batch);
    await search.bulkIndexDocuments(batch);
    batch = [];
  };

  for (const file of files) {
    for await (const raw of streamArchiveJsonArray(file.stream())) {
      const post = mapEntry(raw, index);
      index++;
      if (!post) {
        skipped++;
        continue;
      }

      batch.push(post);
      imported++;

      try {
        const idAsBigInt = BigInt(post.id);
        if (idAsBigInt > maxId) maxId = idAsBigInt;
      } catch {
        // id가 숫자 문자열이 아닌 경우 sync_state 갱신용 최대값 계산에서만 제외
      }

      if (batch.length >= BATCH_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  return { imported, skipped, maxId };
}

/**
 * X 공식 데이터 아카이브(zip)를 스트리밍으로 파싱해 DB에 배치 저장한다 (docs/06_개발가이드.md §5-2).
 * @param ownUsername 아카이브 소유자의 X 아이디 (tweet.js에는 작성자 정보가 없어 별도로 필요)
 */
export async function importArchive(
  db: DbAdapter,
  search: SearchProvider,
  zipPath: string,
  ownUsername: string,
): Promise<ImportSummary> {
  const directory = await unzipper.Open.file(zipPath);
  const savedAt = new Date();

  const tweetFiles = directory.files.filter((f) => TWEET_FILE_PATTERN.test(f.path));
  const likeFiles = directory.files.filter((f) => LIKE_FILE_PATTERN.test(f.path));

  if (tweetFiles.length === 0 && likeFiles.length === 0) {
    throw new Error(
      "아카이브에서 tweet.js 또는 like.js를 찾지 못했습니다. X 공식 데이터 아카이브 zip이 맞는지 확인하세요.",
    );
  }

  const tweetResult = await importEntries(db, search, tweetFiles, (raw) =>
    mapTweetEntry(raw, ownUsername, savedAt),
  );
  if (tweetResult.maxId > 0n) {
    await db.setLastSyncedId("tweets", tweetResult.maxId.toString());
  }

  const likeResult = await importEntries(db, search, likeFiles, (raw, index) =>
    mapLikeEntry(raw, savedAt, index),
  );
  if (likeResult.maxId > 0n) {
    await db.setLastSyncedId("likes", likeResult.maxId.toString());
  }

  return {
    tweetsImported: tweetResult.imported,
    tweetsSkipped: tweetResult.skipped,
    likesImported: likeResult.imported,
    likesSkipped: likeResult.skipped,
    filesProcessed: [...tweetFiles, ...likeFiles].map((f) => f.path),
  };
}
