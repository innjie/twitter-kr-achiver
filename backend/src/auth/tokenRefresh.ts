import type { AppEnv } from "../config/env";
import type { DbAdapter } from "../db/DbAdapter";
import { decryptToken, encryptToken } from "./tokenCrypto";

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
/** 이 여유시간 이내로 만료가 임박하면 폴링 전에 미리 갱신한다 */
const EXPIRY_SAFETY_MARGIN_MS = 60 * 1000;

interface XRefreshTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * DB에 저장된 OAuth 토큰을 복호화해 반환하되, 만료가 임박했으면 refresh_token으로 먼저 갱신한다.
 * X는 refresh_token을 요청마다 새로 발급(rotate)하므로, 갱신 시 새 refresh_token을 반드시 다시 암호화해 저장한다.
 * @returns 유효한 평문 access token. 저장된 토큰 자체가 없으면 null (아직 X 계정 미연동).
 */
export async function getValidAccessToken(db: DbAdapter, env: AppEnv): Promise<string | null> {
  const stored = await db.getOAuthToken();
  if (!stored) {
    return null;
  }

  const isExpiringSoon = stored.expiresAt.getTime() - Date.now() <= EXPIRY_SAFETY_MARGIN_MS;
  if (!isExpiringSoon) {
    return decryptToken(stored.accessToken, env.tokenEncryptionKey);
  }

  if (!env.xClientId || !env.xClientSecret) {
    throw new Error("[tokenRefresh] X_CLIENT_ID/X_CLIENT_SECRET이 설정되지 않아 토큰을 갱신할 수 없습니다");
  }

  const refreshToken = decryptToken(stored.refreshToken, env.tokenEncryptionKey);
  const basicAuthHeader = Buffer.from(`${env.xClientId}:${env.xClientSecret}`).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuthHeader}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`[tokenRefresh] X 토큰 갱신 실패 (${response.status}): ${body}`);
  }

  const tokenData = (await response.json()) as XRefreshTokenResponse;
  if (!tokenData.refresh_token) {
    throw new Error("[tokenRefresh] 갱신 응답에 refresh_token이 없습니다");
  }

  const now = new Date();
  await db.saveOAuthToken({
    accessToken: encryptToken(tokenData.access_token, env.tokenEncryptionKey),
    refreshToken: encryptToken(tokenData.refresh_token, env.tokenEncryptionKey),
    expiresAt: new Date(now.getTime() + tokenData.expires_in * 1000),
    updatedAt: now,
  });

  return tokenData.access_token;
}
