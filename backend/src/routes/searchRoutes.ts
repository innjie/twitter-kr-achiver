import { Router } from "express";
import type { PostRelation } from "../db/DbAdapter";
import type { SearchProvider } from "../search/SearchProvider";
import { parseSearchQuery } from "../search/queryParser";

const VALID_RELATIONS: PostRelation[] = ["tweet", "retweet", "like", "bookmark"];

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/**
 * 검색 API. `q`에 X 스타일 고급 검색 문법(from:/since:/until:/lang:/is:)을 포함해 보낼 수 있다
 * (docs/06_개발가이드.md §7-4, search/queryParser.ts가 파싱). 별도 `lang`/`relation` 쿼리
 * 파라미터도 함께 지원하며, 지정되면 `q`에서 파싱된 값보다 우선한다 (프론트엔드가 검색창과
 * 별도 relation 필터 탭을 함께 쓰는 §10-2 레이아웃을 고려).
 */
export function createSearchRouter(search: SearchProvider): Router {
  const router = Router();

  router.get("/api/search", async (req, res) => {
    const rawQuery = firstString(req.query.q) ?? "";

    let parsed;
    try {
      parsed = parseSearchQuery(rawQuery);
    } catch (err) {
      const message = err instanceof Error ? err.message : "검색어 형식이 올바르지 않습니다";
      res.status(400).json({ error: message });
      return;
    }

    const filters = { ...parsed.filters };

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

    try {
      const result = await search.search(parsed.text, filters);
      res.json(result);
    } catch (err) {
      console.error("[search] 검색 실패:", err);
      const message = err instanceof Error ? err.message : "검색 중 오류가 발생했습니다";
      res.status(500).json({ error: message });
    }
  });

  return router;
}
