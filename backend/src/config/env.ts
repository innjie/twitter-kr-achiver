/**
 * 앱 시작 시 보안 필수 환경변수를 검증한다 (docs/06_개발가이드.md §9).
 * 하나라도 누락되면 실행 자체를 막는다 — "선택"이 아니라 기본값으로 강제되는 항목.
 */

export interface AppEnv {
  appMode: "local" | "server";
  port: number;
  dbType: "sqlite" | "postgres";
  databaseUrl: string;
  searchEngine: "meilisearch" | "elasticsearch";
  tokenEncryptionKey: string;
  appUsername?: string;
  appPassword?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] 필수 환경변수 ${name}가 설정되지 않았습니다. .env.example을 참고해 .env를 구성하세요.`,
    );
  }
  return value;
}

export function validateEnv(): AppEnv {
  const appMode = (process.env.APP_MODE ?? "local") as "local" | "server";
  const dbType = (process.env.DB_TYPE ?? "sqlite") as "sqlite" | "postgres";
  const searchEngine = (process.env.SEARCH_ENGINE ?? "meilisearch") as
    | "meilisearch"
    | "elasticsearch";

  // #5 OAuth 토큰 암호화 키 — 항상 필수
  const tokenEncryptionKey = requireEnv("TOKEN_ENCRYPTION_KEY");

  // #1 / #2 검색엔진 인증 — 선택된 엔진 기준으로 필수
  if (searchEngine === "meilisearch") {
    requireEnv("MEILI_MASTER_KEY");
  } else if (searchEngine === "elasticsearch") {
    requireEnv("ELASTIC_PASSWORD");
  }

  // #8 서버 모드 인증 — server 모드일 때만 필수
  let appUsername: string | undefined;
  let appPassword: string | undefined;
  if (appMode === "server") {
    appUsername = requireEnv("APP_USERNAME");
    appPassword = requireEnv("APP_PASSWORD");
  }

  return {
    appMode,
    port: Number(process.env.PORT ?? 3000),
    dbType,
    databaseUrl: process.env.DATABASE_URL ?? "",
    searchEngine,
    tokenEncryptionKey,
    appUsername,
    appPassword,
  };
}
