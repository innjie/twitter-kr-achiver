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
  /** 런타임 폴링 간격(분). 5~15 범위로 clamp (docs/06_개발가이드.md §5-3) */
  pollIntervalMinutes: number;
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

const POLL_INTERVAL_MIN_MINUTES = 5;
const POLL_INTERVAL_MAX_MINUTES = 15;
const POLL_INTERVAL_DEFAULT_MINUTES = 10;

/** X_POLL_INTERVAL_MINUTES를 5~15 범위로 clamp (docs/06_개발가이드.md §5-3 권장 범위) */
function resolvePollIntervalMinutes(): number {
  const raw = process.env.X_POLL_INTERVAL_MINUTES;
  const parsed = raw ? Number(raw) : POLL_INTERVAL_DEFAULT_MINUTES;
  if (!Number.isFinite(parsed)) {
    return POLL_INTERVAL_DEFAULT_MINUTES;
  }
  return Math.min(Math.max(parsed, POLL_INTERVAL_MIN_MINUTES), POLL_INTERVAL_MAX_MINUTES);
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

  // #8 서버 모드 인증 — 공인 노출(도메인/Cloudflare Tunnel)이면 필수, Tailscale 등
  // 사설 네트워크 전용 노출이면 선택(사용자가 직접 켜고 끌 수 있음)
  let appUsername = process.env.APP_USERNAME || undefined;
  let appPassword = process.env.APP_PASSWORD || undefined;
  if (appMode === "server") {
    const isPubliclyExposed = Boolean(process.env.DOMAIN || process.env.CLOUDFLARE_TUNNEL_TOKEN);
    if (isPubliclyExposed) {
      appUsername = requireEnv("APP_USERNAME");
      appPassword = requireEnv("APP_PASSWORD");
    } else if (Boolean(appUsername) !== Boolean(appPassword)) {
      throw new Error(
        "[env] APP_USERNAME/APP_PASSWORD는 둘 다 설정하거나 둘 다 비워두세요 " +
          "(Tailscale 등 사설 네트워크 전용 노출 시에는 선택 사항입니다).",
      );
    }
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
    pollIntervalMinutes: resolvePollIntervalMinutes(),
  };
}
