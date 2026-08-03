const LANG_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "전체 언어" },
  { value: "ko", label: "한국어" },
  { value: "en", label: "영어" },
  { value: "ja", label: "일본어" },
  { value: "zh", label: "중국어" },
];

interface LangFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function LangFilter({ value, onChange }: LangFilterProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-700"
    >
      {LANG_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
