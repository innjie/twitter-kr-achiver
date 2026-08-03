import type { PostRelation } from "../api/search";

export type RelationTabValue = PostRelation | "all";

const TABS: { value: RelationTabValue; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "tweet", label: "트윗" },
  { value: "retweet", label: "리트윗" },
  { value: "like", label: "좋아요" },
  { value: "bookmark", label: "북마크" },
];

interface RelationTabsProps {
  value: RelationTabValue;
  onChange: (value: RelationTabValue) => void;
}

export function RelationTabs({ value, onChange }: RelationTabsProps) {
  return (
    <div className="flex gap-1 border-b border-neutral-200">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={
            "px-3 py-2 text-sm " +
            (value === tab.value
              ? "border-b-2 border-neutral-800 font-medium text-neutral-900"
              : "text-neutral-500")
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
