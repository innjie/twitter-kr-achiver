import { useEffect, useState } from "react";
import { searchPosts, SearchApiError, type SearchHit } from "./api/search";
import { SearchBar } from "./components/SearchBar";
import { RelationTabs, type RelationTabValue } from "./components/RelationTabs";
import { LangFilter } from "./components/LangFilter";
import { Feed } from "./components/Feed";

const LIMIT = 20;

interface RunSearchParams {
  q: string;
  relation: RelationTabValue;
  lang: string;
  offset: number;
  append: boolean;
}

function App() {
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState<RelationTabValue>("all");
  const [lang, setLang] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(params: RunSearchParams) {
    setLoading(true);
    setError(null);
    try {
      const result = await searchPosts({
        q: params.q,
        relation: params.relation === "all" ? undefined : params.relation,
        lang: params.lang || undefined,
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
    void runSearch({ q: query, relation, lang, offset: 0, append: false });
    // relation/lang이 바뀔 때만 재조회 (query는 검색 버튼으로만 트리거)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relation, lang]);

  function handleSearch(q: string) {
    setQuery(q);
    void runSearch({ q, relation, lang, offset: 0, append: false });
  }

  function handleLoadMore() {
    void runSearch({ q: query, relation, lang, offset: hits.length, append: true });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <div className="sticky top-0 z-10 bg-white py-2">
        <SearchBar onSearch={handleSearch} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <RelationTabs value={relation} onChange={setRelation} />
        <LangFilter value={lang} onChange={setLang} />
      </div>

      {error && <p className="text-red-600">{error}</p>}

      <Feed hits={hits} hasMore={hasMore} loading={loading} onLoadMore={handleLoadMore} />
    </main>
  );
}

export default App;
