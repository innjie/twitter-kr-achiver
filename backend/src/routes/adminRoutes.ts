import { Router } from "express";
import type { DbAdapter } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { reindexAll } from "../search/reindex";

/** 검색엔진 전환/재구성 후 DB 전체를 검색엔진에 다시 색인하는 관리용 라우트 */
export function createAdminRouter(db: DbAdapter, search: SearchProvider): Router {
  const router = Router();

  router.post("/api/admin/reindex", async (_req, res) => {
    try {
      const result = await reindexAll(db, search);
      res.json({ status: "ok", ...result });
    } catch (err) {
      console.error("[admin] 재색인 실패:", err);
      const message = err instanceof Error ? err.message : "알 수 없는 오류로 재색인에 실패했습니다";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
