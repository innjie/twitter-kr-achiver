import { useEffect, useState } from "react";
import { searchPosts, SearchApiError, type SearchHit, type SearchSort } from "./api/search";
import { getPollingStatus } from "./api/pollingStatus";
import { SearchBar } from "./components/SearchBar";
import { RelationTabs, type RelationTabValue } from "./components/RelationTabs";
import { LangFilter } from "./components/LangFilter";
import { SortToggle } from "./components/SortToggle";
import { Feed } from "./components/Feed";
import { PollingWarningBanner } from "./components/PollingWarningBanner";

const LIMIT = 20;

interface RunSearchParams {
  q: string;
  relation: RelationTabValue;
  lang: string;
  sort: SearchSort;
  offset: number;
  append: boolean;
}

function App() {
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState<RelationTabValue>("all");
  const [lang, setLang] = useState("");
  const [sort, setSort] = useState<SearchSort>("recency");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingWarning, setPollingWarning] = useState<string | null>(null);

  async function runSearch(params: RunSearchParams) {
    setLoading(true);
    setError(null);
    try {
      const result = await searchPosts({
        q: params.q,
        relation: params.relation === "all" ? undefined : params.relation,
        lang: params.lang || undefined,
        sort: params.sort,
        limit: LIMIT,
        offset: params.offset,
      });
      setHits((prev) => (params.append ? [...prev, ...result.hits] : result.hits));
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err instanceof SearchApiError ? err.message : "검색 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runSearch({ q: query, relation, lang, sort, offset: 0, append: false });
    // relation/lang/sort가 바뀔 때만 재조회 (query는 검색 버튼으로만 트리거)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relation, lang, sort]);

  useEffect(() => {
    void getPollingStatus().then((status) => {
      setPollingWarning(status.connected && status.hasError ? (status.message ?? null) : null);
    });
  }, []);

  function handleSearch(q: string) {
    setQuery(q);
    void runSearch({ q, relation, lang, sort, offset: 0, append: false });
  }

  function handleLoadMore() {
    void runSearch({ q: query, relation, lang, sort, offset: hits.length, append: true });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      {pollingWarning && <PollingWarningBanner message={pollingWarning} />}

      <div className="sticky top-0 z-10 bg-white py-2">
        <SearchBar onSearch={handleSearch} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <RelationTabs value={relation} onChange={setRelation} />
        <div className="flex items-center gap-2">
          <SortToggle value={sort} onChange={setSort} />
          <LangFilter value={lang} onChange={setLang} />
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <Feed hits={hits} hasMore={hasMore} loading={loading} onLoadMore={handleLoadMore} />
    </main>
  );
}

export default App;
