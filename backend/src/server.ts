import "dotenv/config";
import { validateEnv } from "./config/env";
import { createDbAdapter } from "./db";
import { createApp } from "./app";

// 보안 필수 환경변수가 없으면 여기서 즉시 실행이 중단된다 (docs/06_개발가이드.md §9)
const env = validateEnv();

// TODO: createSearchProvider()로 검색엔진 어댑터를 생성하고
// 초기 아카이브 임포트·X API 폴링·검색 라우트에 연결 (아직 미구현)

async function main() {
  const db = createDbAdapter();
  await db.connect();

  const app = createApp(env);

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
