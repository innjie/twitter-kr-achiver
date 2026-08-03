import { useState, type FormEvent } from "react";

interface SearchBarProps {
  initialValue?: string;
  onSearch: (query: string) => void;
}

export function SearchBar({ initialValue = "", onSearch }: SearchBarProps) {
  const [value, setValue] = useState(initialValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSearch(value);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="검색어 또는 from:/since:/until:/lang:/is: 문법"
        className="flex-1 rounded border border-neutral-300 px-3 py-2 text-neutral-800"
      />
      <button
        type="submit"
        className="rounded bg-neutral-800 px-4 py-2 text-white"
      >
        검색
      </button>
    </form>
  );
}
