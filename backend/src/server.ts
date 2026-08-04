import "dotenv/config";
import { validateEnv } from "./config/env";
import { createDbAdapter } from "./db";
import { createSearchProvider } from "./search";
import { createApp } from "./app";
import { startPolling, type PollingHandle } from "./polling/scheduler";

// 보안 필수 환경변수가 없으면 여기서 즉시 실행이 중단된다 (docs/06_개발가이드.md §9)
const env = validateEnv();

async function main() {
  const db = createDbAdapter();
  await db.connect();

  const search = createSearchProvider();
  await search.connect();

  const app = createApp(env, db, search);

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (mode: ${env.appMode})`);
  });

  // X 계정이 연동된 경우에만 폴링 시작 (아카이브 임포트만 쓰는 사용자는 대상 아님)
  let polling: PollingHandle | null = null;
  if ((await db.getOAuthToken()) !== null) {
    polling = startPolling(db, search, env);
  }

  const shutdown = async () => {
    polling?.stop();
    server.close();
    await db.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[server] failed to start:", err);
  process.exit(1);
});
