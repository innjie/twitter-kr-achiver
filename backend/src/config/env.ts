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
  xClientId?: string;
  xClientSecret?: string;
  xRedirectUri?: string;
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

const TOKEN_ENCRYPTION_KEY_BYTE_LENGTH = 32;

/** TOKEN_ENCRYPTION_KEY가 AES-256에 필요한 32바이트를 hex로 표현한 값(64자)인지 검증 */
function validateTokenEncryptionKey(key: string): string {
  const isValidHex = /^[0-9a-fA-F]+$/.test(key);
  if (!isValidHex || Buffer.from(key, "hex").length !== TOKEN_ENCRYPTION_KEY_BYTE_LENGTH) {
    throw new Error(
      `[env] TOKEN_ENCRYPTION_KEY는 AES-256용 32바이트를 hex로 표현한 64자 문자열이어야 합니다 ` +
        `(예: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 로 생성).`,
    );
  }
  return key;
}

export function validateEnv(): AppEnv {
  const appMode = (process.env.APP_MODE ?? "local") as "local" | "server";
  const dbType = (process.env.DB_TYPE ?? "sqlite") as "sqlite" | "postgres";
  const searchEngine = (process.env.SEARCH_ENGINE ?? "meilisearch") as
    | "meilisearch"
    | "elasticsearch";

  // #5 OAuth 토큰 암호화 키 — 항상 필수, 형식(32바이트 hex)도 검증
  const tokenEncryptionKey = validateTokenEncryptionKey(requireEnv("TOKEN_ENCRYPTION_KEY"));

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
    // X API OAuth — 아카이브 임포트만 쓰는 사용자도 서버를 띄울 수 있어야 하므로 시작 시 필수는 아님,
    // 실제 /auth/login 호출 시점에 없으면 그때 에러
    xClientId: process.env.X_CLIENT_ID || undefined,
    xClientSecret: process.env.X_CLIENT_SECRET || undefined,
    xRedirectUri: process.env.X_REDIRECT_URI || undefined,
  };
}
