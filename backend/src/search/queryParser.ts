import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { PostRelation } from "../db/DbAdapter";
import type { SearchFilters } from "./SearchProvider";

dayjs.extend(customParseFormat);

const TOKEN_PATTERN = /\b(from|since|until|lang|is):(\S+)/gi;
const DATE_FORMAT = "YYYY-MM-DD";
const VALID_RELATIONS: PostRelation[] = ["tweet", "retweet", "like", "bookmark"];

export interface ParsedSearchQuery {
  text: string;
  filters: SearchFilters;
}

function parseDateBoundary(token: "since" | "until", value: string): Date {
  const parsed = dayjs(value, DATE_FORMAT, true);
  if (!parsed.isValid()) {
    throw new Error(`${token}: 날짜는 ${DATE_FORMAT} 형식이어야 합니다 (입력값: ${value})`);
  }
  return (token === "since" ? parsed.startOf("day") : parsed.endOf("day")).toDate();
}

/**
 * X 스타일 고급 검색 문법(from:/since:/until:/lang:/is:)을 파싱해 자유 검색어와 필터로 분리한다
 * (docs/06_개발가이드.md §7-4). 정규식 기반, 별도 NLP 라이브러리 불필요.
 *
 * is:reply는 relation이 아니라 posts.is_reply(별도 축, relation과 동시에 참일 수 있음)로 매핑된다.
 * 그 외 is:tweet/retweet/like/bookmark는 posts.relation과 매핑된다.
 */
export function parseSearchQuery(raw: string): ParsedSearchQuery {
  const filters: SearchFilters = {};

  const text = raw
    .replace(TOKEN_PATTERN, (_match, token: string, value: string) => {
      switch (token.toLowerCase()) {
        case "from":
          filters.authorUsername = value;
          break;
        case "since":
          filters.since = parseDateBoundary("since", value);
          break;
        case "until":
          filters.until = parseDateBoundary("until", value);
          break;
        case "lang":
          filters.lang = value;
          break;
        case "is": {
          const normalizedValue = value.toLowerCase();
          if (normalizedValue === "reply") {
            filters.isReply = true;
            break;
          }
          if (!VALID_RELATIONS.includes(normalizedValue as PostRelation)) {
            throw new Error(
              `is:${value}는 지원하지 않습니다 (지원값: ${VALID_RELATIONS.join("/")}/reply)`,
            );
          }
          filters.relation = normalizedValue as PostRelation;
          break;
        }
      }
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();

  return { text, filters };
}
