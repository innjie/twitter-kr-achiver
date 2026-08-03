import type { SearchHit } from "../api/search";
import { parseHighlightedText } from "../utils/highlight";

const RELATION_LABEL: Record<SearchHit["relation"], string> = {
  tweet: "트윗",
  retweet: "리트윗",
  like: "좋아요",
  bookmark: "북마크",
};

interface PostCardProps {
  hit: SearchHit;
}

export function PostCard({ hit }: PostCardProps) {
  const segments = parseHighlightedText(hit.highlightedText);

  return (
    <article className="rounded-lg border border-neutral-200 p-4 text-left">
      <div className="mb-2 flex items-center gap-2 text-sm text-neutral-500">
        <span className="font-medium text-neutral-700">@{hit.authorUsername}</span>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">
          {RELATION_LABEL[hit.relation]}
        </span>
        {hit.isReply && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">답글</span>
        )}
      </div>

      <p className="whitespace-pre-wrap text-neutral-800">
        {segments.map((segment, i) =>
          segment.highlighted ? (
            <mark key={i} className="bg-yellow-200">
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </p>

      <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
        <time dateTime={hit.createdAt}>{new Date(hit.createdAt).toLocaleString()}</time>
        <a href={hit.url} target="_blank" rel="noreferrer" className="underline">
          원본 보기
        </a>
      </div>
    </article>
  );
}
