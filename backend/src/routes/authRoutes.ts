import { Router } from "express";
import type { AppEnv } from "../config/env";
import type { DbAdapter } from "../db/DbAdapter";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "../auth/pkce";
import { consumePendingAuth, storePendingAuth } from "../auth/pendingAuth";
import { encryptToken } from "../auth/tokenCrypto";

const AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
// tweet/like/bookmark 조회(sync_state 채널) + offline.access(refresh_token 발급)
const SCOPES = "tweet.read users.read like.read bookmark.read offline.access";

interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * X API OAuth 2.0 Authorization Code + PKCE 연동 라우트 (docs/06_개발가이드.md §5-1, §9 #5/#6).
 * X_CLIENT_ID/SECRET/REDIRECT_URI는 앱 시작 시 필수가 아니라 이 라우트 호출 시점에 검증한다
 * (아카이브 임포트만 쓰는 사용자도 서버는 띄울 수 있어야 하므로).
 */
export function createAuthRouter(db: DbAdapter, env: AppEnv): Router {
  const router = Router();

  router.get("/auth/login", (req, res) => {
    if (!env.xClientId || !env.xRedirectUri) {
      res.status(500).json({ error: "X_CLIENT_ID/X_REDIRECT_URI가 설정되지 않았습니다. .env를 확인하세요." });
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    storePendingAuth(state, codeVerifier);

    const authorizeUrl = new URL(AUTHORIZE_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", env.xClientId);
    authorizeUrl.searchParams.set("redirect_uri", env.xRedirectUri);
    authorizeUrl.searchParams.set("scope", SCOPES);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    res.redirect(authorizeUrl.toString());
  });

  router.get("/auth/callback", async (req, res) => {
    const { code, state, error, error_description: errorDescription } = req.query;

    if (typeof error === "string") {
      res.status(400).json({ error: `X 인증이 거부되었습니다: ${errorDescription ?? error}` });
      return;
    }

    if (typeof state !== "string" || typeof code !== "string") {
      res.status(400).json({ error: "code/state 파라미터가 올바르지 않습니다" });
      return;
    }

    const codeVerifier = consumePendingAuth(state);
    if (!codeVerifier) {
      res.status(400).json({ error: "state가 유효하지 않거나 만료되었습니다. 다시 로그인해주세요." });
      return;
    }

    if (!env.xClientId || !env.xClientSecret || !env.xRedirectUri) {
      res.status(500).json({ error: "X_CLIENT_ID/X_CLIENT_SECRET/X_REDIRECT_URI가 설정되지 않았습니다." });
      return;
    }

    try {
      const basicAuthHeader = Buffer.from(`${env.xClientId}:${env.xClientSecret}`).toString("base64");
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuthHeader}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: env.xRedirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenResponse.ok) {
        const body = await tokenResponse.text();
        console.error("[auth] X 토큰 교환 실패:", tokenResponse.status, body);
        res.status(502).json({ error: "X와의 토큰 교환에 실패했습니다" });
        return;
      }

      const tokenData = (await tokenResponse.json()) as XTokenResponse;
      if (!tokenData.refresh_token) {
        res.status(502).json({
          error: "refresh_token이 발급되지 않았습니다. X 개발자 포털의 앱 권한(offline.access 스코프 허용 여부)을 확인하세요.",
        });
        return;
      }

      const now = new Date();
      await db.saveOAuthToken({
        accessToken: encryptToken(tokenData.access_token, env.tokenEncryptionKey),
        refreshToken: encryptToken(tokenData.refresh_token, env.tokenEncryptionKey),
        expiresAt: new Date(now.getTime() + tokenData.expires_in * 1000),
        updatedAt: now,
      });

      res.send("X 계정 연동이 완료되었습니다. 이 창은 닫으셔도 됩니다.");
    } catch (err) {
      console.error("[auth] 콜백 처리 중 오류:", err);
      res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다" });
    }
  });

  router.get("/auth/status", async (req, res) => {
    const token = await db.getOAuthToken();
    res.json({ connected: token !== null });
  });

  return router;
}
