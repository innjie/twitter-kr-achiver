import type { AppEnv } from "../config/env";
import type { DbAdapter } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { getValidAccessToken } from "../auth/tokenRefresh";
import { pollAllChannels, type PollResult } from "./pollChannels";

export interface PollingHandle {
  stop: () => void;
}

export interface LastPollStatus {
  ranAt: Date;
  result: PollResult;
}

// 프로세스 인메모리 상태 (pendingAuth.ts와 같은 패턴) — GET /api/polling/status에서 조회.
// 재시작 시 초기화되는 건 의도된 동작: 재시작 직후 캐치업 폴링이 다시 값을 채운다.
let lastPollStatus: LastPollStatus | null = null;

export function getLastPollStatus(): LastPollStatus | null {
  return lastPollStatus;
}

function recordFailure(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  lastPollStatus = {
    ranAt: new Date(),
    result: {
      tweets: 0,
      likes: 0,
      bookmarks: 0,
      errors: (["tweets", "likes", "bookmarks"] as const).map((channel) => ({ channel, message })),
    },
  };
}

async function runPollCycle(db: DbAdapter, search: SearchProvider, env: AppEnv): Promise<void> {
  let accessToken: string | null;
  try {
    accessToken = await getValidAccessToken(db, env);
  } catch (err) {
    console.error("[polling] 토큰 갱신 실패:", err);
    recordFailure(err);
    return;
  }

  if (!accessToken) {
    // X 계정이 아직 연동되지 않은 경우 (아카이브 임포트만 쓰는 사용자) — 조용히 스킵, 상태도 갱신하지 않음
    return;
  }

  const result = await pollAllChannels(db, search, accessToken);
  lastPollStatus = { ranAt: new Date(), result };

  if (result.errors.length > 0) {
    console.warn(
      `[polling] 일부 채널 실패: ${result.errors.map((e) => `${e.channel}(${e.status ?? "?"})`).join(", ")}`,
    );
  } else {
    console.log(
      `[polling] 완료 — 신규: tweets ${result.tweets}건, likes ${result.likes}건, bookmarks ${result.bookmarks}건`,
    );
  }
}

/**
 * 재시작 캐치업(즉시 1회) + 5~15분 간격 반복 폴링을 시작한다 (docs/06_개발가이드.md §5-3).
 * X 계정이 연동되지 않은 경우(getOAuthToken() === null) 아무 것도 하지 않는다 — 호출 전에 확인 필요.
 * 이전 사이클이 아직 끝나지 않았으면 다음 tick을 건너뛰어 중복 실행을 막는다.
 */
export function startPolling(db: DbAdapter, search: SearchProvider, env: AppEnv): PollingHandle {
  let isRunning = false;

  const tick = () => {
    if (isRunning) {
      console.warn("[polling] 이전 폴링 사이클이 아직 진행 중이라 이번 주기를 건너뜁니다");
      return;
    }
    isRunning = true;
    runPollCycle(db, search, env)
      .catch((err) => console.error("[polling] 예기치 못한 오류:", err))
      .finally(() => {
        isRunning = false;
      });
  };

  tick(); // 재시작 캐치업
  const intervalId = setInterval(tick, env.pollIntervalMinutes * 60 * 1000);

  return { stop: () => clearInterval(intervalId) };
}
