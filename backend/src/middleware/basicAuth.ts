import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * 상수시간 문자열 비교. 길이가 다른 값도 안전하게 비교하기 위해 SHA-256으로 고정 길이화한 뒤
 * crypto.timingSafeEqual을 사용한다 (일반 `!==` 비교는 타이밍 공격에 노출됨).
 */
function timingSafeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * 서버 모드(APP_MODE=server)에서 강제되는 Basic Auth 미들웨어 (docs/06_개발가이드.md §9 #8).
 * 터널(Tailscale/Cloudflare Tunnel) 등으로 외부 노출 시 최소한의 인증 계층을 제공한다.
 */
export function basicAuth(username: string, password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Basic ")) {
      res.set("WWW-Authenticate", "Basic realm=\"twitter-kr-achiver\"");
      return res.status(401).send("Authentication required");
    }

    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf-8");
    const [reqUsername, reqPassword] = decoded.split(":");

    const usernameMatches = timingSafeEqual(reqUsername ?? "", username);
    const passwordMatches = timingSafeEqual(reqPassword ?? "", password);

    if (!usernameMatches || !passwordMatches) {
      res.set("WWW-Authenticate", "Basic realm=\"twitter-kr-achiver\"");
      return res.status(401).send("Invalid credentials");
    }

    next();
  };
}
