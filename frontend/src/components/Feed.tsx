import type { SearchHit } from "../api/search";
import { PostCard } from "./PostCard";

interface FeedProps {
  hits: SearchHit[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

export function Feed({ hits, hasMore, loading, onLoadMore }: FeedProps) {
  if (hits.length === 0 && !loading) {
    return <p className="py-8 text-center text-neutral-500">검색 결과가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {hits.map((hit) => (
        // 같은 트윗이 tweet/retweet/like/bookmark로 동시에 나올 수 있어 id 단독으로는 키가 겹칠 수 있음
        <PostCard key={`${hit.relation}-${hit.id}`} hit={hit} />
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="mt-2 rounded border border-neutral-300 py-2 text-neutral-700 disabled:opacity-50"
        >
          {loading ? "불러오는 중..." : "더 보기"}
        </button>
      )}
    </div>
  );
}
