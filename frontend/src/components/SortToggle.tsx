import type { SearchSort } from "../api/search";

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: "recency", label: "최신순" },
  { value: "relevance", label: "관련도순" },
];

interface SortToggleProps {
  value: SearchSort;
  onChange: (value: SearchSort) => void;
}

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <div className="flex gap-1 rounded border border-neutral-300 p-0.5 text-sm">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={
            "rounded px-2 py-1 " +
            (value === opt.value ? "bg-neutral-800 text-white" : "text-neutral-600")
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
