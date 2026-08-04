import { useState } from "react";

interface PollingWarningBannerProps {
  message: string;
}

/** X API 자동 동기화 실패 시 상단에 노출되는 경고 배너. 현재 세션에서만 닫기 가능 (새로고침 시 재조회) */
export function PollingWarningBanner({ message }: PollingWarningBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p className="flex-1">{message}</p>
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => setDismissed(true)}
        className="shrink-0 text-amber-800 opacity-70 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
