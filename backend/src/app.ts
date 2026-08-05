import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import type { AppEnv } from "./config/env";
import { basicAuth } from "./middleware/basicAuth";
import type { DbAdapter } from "./db/DbAdapter";
import type { SearchProvider } from "./search/SearchProvider";
import { createImportRouter } from "./routes/importRoutes";
import { createSearchRouter } from "./routes/searchRoutes";
import { createAuthRouter } from "./routes/authRoutes";
import { createPollingRouter } from "./routes/pollingRoutes";
import { createAdminRouter } from "./routes/adminRoutes";

export function createApp(env: AppEnv, db: DbAdapter, search: SearchProvider) {
  const app = express();
  app.use(express.json());

  // #8 서버 모드 Basic Auth — 공인 노출 시에는 validateEnv가 자격증명 존재를 보장,
  // Tailscale 등 사설 네트워크 전용 노출이면 자격증명 없이 실행될 수 있음(의도된 동작)
  if (env.appMode === "server") {
    if (env.appUsername && env.appPassword) {
      app.use(basicAuth(env.appUsername, env.appPassword));
    } else {
      console.warn(
        "[app] Basic Auth 없이 서버 모드로 실행 중입니다. Tailscale 등 사설 네트워크 전용 노출인지 확인하세요.",
      );
    }
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", appMode: env.appMode });
  });

  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(createImportRouter(db, search));
  app.use(createSearchRouter(search));
  app.use(createAuthRouter(db, env));
  app.use(createPollingRouter(db));
  app.use(createAdminRouter(db, search));

  const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error("[app] unhandled error:", err);
    const message = err instanceof Error ? err.message : "요청 처리 중 오류가 발생했습니다";
    res.status(500).json({ error: message });
  };
  app.use(handleError);

  return app;
}
