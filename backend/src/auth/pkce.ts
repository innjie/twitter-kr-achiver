import crypto from "node:crypto";

/**
 * OAuth 2.0 Authorization Code + PKCE(RFC 7636) 관련 값 생성.
 * code_verifier는 43~128자 요구사항을 만족해야 하므로 32바이트 랜덤값을 base64url로 인코딩(43자)한다.
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** code_verifier의 SHA-256 해시를 base64url로 인코딩 (code_challenge_method=S256) */
export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

/** CSRF 방지용 state 파라미터 (고엔트로피 랜덤값) */
export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}
