import type { NextFunction, Request, Response } from "express";

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

    if (reqUsername !== username || reqPassword !== password) {
      res.set("WWW-Authenticate", "Basic realm=\"twitter-kr-achiver\"");
      return res.status(401).send("Invalid credentials");
    }

    next();
  };
}
