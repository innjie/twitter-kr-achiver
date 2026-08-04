export interface PollingStatus {
  connected: boolean;
  hasError?: boolean;
  message?: string;
  lastRanAt?: string;
}

/** X 계정 미연동이거나 자동 동기화 실패가 없으면 hasError는 없거나 false */
export async function getPollingStatus(): Promise<PollingStatus> {
  const response = await fetch("/api/polling/status");
  if (!response.ok) {
    // 경고 배너용 보조 정보라 실패해도 화면을 막지 않고 "문제 없음"으로 취급
    return { connected: false };
  }
  return response.json();
}
