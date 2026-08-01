import express from "express";
import type { AppEnv } from "./config/env";
import { basicAuth } from "./middleware/basicAuth";

export function createApp(env: AppEnv) {
  const app = express();
  app.use(express.json());

  // #8 서버 모드는 Basic Auth 없이 실행 차단 (validateEnv가 이미 자격증명 존재를 보장)
  if (env.appMode === "server") {
    app.use(basicAuth(env.appUsername!, env.appPassword!));
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", appMode: env.appMode });
  });

  // TODO: DB 어댑터 / SearchProvider를 사용하는 실제 라우트는 추후 구현
  // (초기 아카이브 임포트, X API 폴링, 검색 API 등)

  return app;
}
