import type { AppEnv } from "../config/env";
import type { DbAdapter } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { getValidAccessToken } from "../auth/tokenRefresh";
import { XApiRateLimitError } from "./xApiClient";
import { pollAllChannels } from "./pollChannels";

export interface PollingHandle {
  stop: () => void;
}

async function runPollCycle(db: DbAdapter, search: SearchProvider, env: AppEnv): Promise<void> {
  const accessToken = await getValidAccessToken(db, env);
  if (!accessToken) {
    // X 계정이 아직 연동되지 않은 경우 (아카이브 임포트만 쓰는 사용자) — 조용히 스킵
    return;
  }

  try {
    const result = await pollAllChannels(db, search, accessToken);
    console.log(
      `[polling] 완료 — 신규: tweets ${result.tweets}건, likes ${result.likes}건, bookmarks ${result.bookmarks}건`,
    );
  } catch (err) {
    if (err instanceof XApiRateLimitError) {
      console.warn(
        `[polling] rate limit 도달, 이번 주기 건너뜀. 초기화 시각: ${err.resetAt?.toISOString() ?? "알 수 없음"}`,
      );
      return;
    }
    console.error("[polling] 폴링 사이클 실패:", err);
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
