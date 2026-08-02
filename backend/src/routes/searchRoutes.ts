import { Router } from "express";
import type { PostRelation } from "../db/DbAdapter";
import type { SearchFilters, SearchProvider } from "../search/SearchProvider";

const VALID_RELATIONS: PostRelation[] = ["tweet", "retweet", "like", "bookmark"];

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * 최소 버전 검색 API. from:/since:/until: 등 고급 쿼리 문법 파서는 별도 TODO(#6)로 남겨두고,
 * 여기서는 검색어 + lang/relation 필터 정도만 지원한다.
 *
 * lang은 ko/en/ja/zh로 제한하지 않는다: X API의 lang 필드는 BCP-47 코드(fr, es, und 등)를
 * 그대로 줄 수 있어, 4개로 제한하면 실제 존재하는 데이터를 필터링할 수 없는 경우가 생긴다.
 * relation은 우리 스키마상 값이 4개로 고정되어 있어 계속 엄격하게 검증한다.
 */
export function createSearchRouter(search: SearchProvider): Router {
  const router = Router();

  router.get("/api/search", async (req, res) => {
    try {
      const query = firstString(req.query.q) ?? "";

      const filters: SearchFilters = {};

      const lang = firstString(req.query.lang);
      if (lang) {
        filters.lang = lang;
      }

      const relation = firstString(req.query.relation);
      if (relation) {
        if (!VALID_RELATIONS.includes(relation as PostRelation)) {
          res.status(400).json({ error: `relation은 ${VALID_RELATIONS.join("/")} 중 하나여야 합니다` });
          return;
        }
        filters.relation = relation as PostRelation;
      }

      const result = await search.search(query, filters);
      res.json(result);
    } catch (err) {
      console.error("[search] 검색 실패:", err);
      const message = err instanceof Error ? err.message : "검색 중 오류가 발생했습니다";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
