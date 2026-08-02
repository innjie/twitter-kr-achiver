import "dotenv/config";
import { validateEnv } from "./config/env";
import { createDbAdapter } from "./db";
import { createSearchProvider } from "./search";
import { createApp } from "./app";

// 보안 필수 환경변수가 없으면 여기서 즉시 실행이 중단된다 (docs/06_개발가이드.md §9)
const env = validateEnv();

// TODO: X API 폴링 관련 초기화는 추후 구현

async function main() {
  const db = createDbAdapter();
  await db.connect();

  const search = createSearchProvider();
  await search.connect();

  const app = createApp(env, db, search);

  const server = app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port} (mode: ${env.appMode})`);
  });

  const shutdown = async () => {
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
