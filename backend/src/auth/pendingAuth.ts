/**
 * OAuth 로그인 시작(~/auth/login)과 콜백(~/auth/callback) 사이에 code_verifier를
 * state 값으로 잠깐 들고 있기 위한 인메모리 저장소.
 * 로컬 단일 인스턴스·단일 사용자 도구라 Redis 등 외부 저장소 없이 프로세스 메모리로 충분하다고 판단
 * (서버 재시작 사이에 로그인 중이었다면 다시 시도하면 됨).
 */

interface PendingAuthEntry {
  codeVerifier: string;
  expiresAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

const pendingStates = new Map<string, PendingAuthEntry>();

export function storePendingAuth(state: string, codeVerifier: string): void {
  pendingStates.set(state, { codeVerifier, expiresAt: Date.now() + PENDING_TTL_MS });
}

/** state로 codeVerifier를 조회 후 즉시 제거한다 (1회용, 재전송 공격 방지). 없거나 만료됐으면 null. */
export function consumePendingAuth(state: string): string | null {
  const entry = pendingStates.get(state);
  pendingStates.delete(state);

  if (!entry || Date.now() > entry.expiresAt) {
    return null;
  }
  return entry.codeVerifier;
}
