import { Router } from "express";
import type { DbAdapter } from "../db/DbAdapter";
import { getLastPollStatus } from "../polling/scheduler";
import type { PollChannelError } from "../polling/pollChannels";

/** X 응답 원문은 서버 로그에만 남기고, 프론트에는 일반화된 안내 문구만 내려준다 */
function summarizeErrors(errors: PollChannelError[]): string {
  if (errors.some((e) => e.status === 402)) {
    return "X API 자동 동기화가 중단됐습니다. X Developer Portal에서 결제수단/크레딧을 확인해주세요.";
  }
  return "X API 자동 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도합니다.";
}

/** 프론트 경고 배너용 폴링 상태 조회 라우트 (claude.md 프론트엔드 섹션 참고) */
export function createPollingRouter(db: DbAdapter): Router {
  const router = Router();

  router.get("/api/polling/status", async (_req, res) => {
    const token = await db.getOAuthToken();
    if (!token) {
      res.json({ connected: false });
      return;
    }

    const lastPoll = getLastPollStatus();
    if (!lastPoll || lastPoll.result.errors.length === 0) {
      res.json({ connected: true, hasError: false });
      return;
    }

    res.json({
      connected: true,
      hasError: true,
      message: summarizeErrors(lastPoll.result.errors),
      lastRanAt: lastPoll.ranAt.toISOString(),
    });
  });

  return router;
}
