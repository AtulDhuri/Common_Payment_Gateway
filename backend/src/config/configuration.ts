// FILE: config/configuration.ts
// PURPOSE: Env validation and typed config. Fails fast when a variable is missing
// DEPENDENCIES: process.env
// PHASE: 2 (MASTER_ENCRYPTION_KEY in PHASE 4, PUBLIC_BASE_URL in PHASE 5, webhook worker settings in PHASE 8)
export interface WebhookWorkerConfig {
  enabled: boolean;
  pollIntervalMs: number;
  /** Seconds to wait after attempt 1, 2, ... Attempts allowed = length + 1 (docs/merchant-webhooks.md). */
  retryDelaysSeconds: number[];
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  /** Origin used to build checkoutUrl, no trailing slash. */
  publicBaseUrl: string;
  /** 32-byte AES-256 key. Environment only, never stored (security-design.md). */
  masterEncryptionKey: Buffer;
  /** NODE_ENV === 'production'. Turns on strict outbound webhook rules (https only, no private addresses). */
  isProduction: boolean;
  webhooks: WebhookWorkerConfig;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
}

const DEFAULT_RETRY_DELAYS = [60, 300, 1800, 7200, 43200]; // 1m, 5m, 30m, 2h, 12h (api-design.md)

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

/** Accepts 64 hex chars or base64 that decodes to exactly 32 bytes. */
export function parseMasterKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MASTER_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64)');
  }
  return key;
}

export function parseRetryDelays(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_RETRY_DELAYS;
  const parts = raw.split(',').map((p) => p.trim());
  const delays = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (delays.length === 0 || delays.some((d) => !Number.isInteger(d) || d < 1)) {
    throw new Error('WEBHOOK_RETRY_DELAYS_SECONDS must be a comma-separated list of positive whole seconds');
  }
  return delays;
}

function parsePollInterval(raw: string | undefined): number {
  if (!raw) return 5000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 100) throw new Error('WEBHOOK_POLL_INTERVAL_MS must be a whole number of at least 100');
  return n;
}

/**
 * Optional vars default to safe values. When `needsEncryptionKey` is false the key is
 * not read (used by the migration CLI, which never encrypts anything).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, needsEncryptionKey = true): AppConfig {
  const accessSecret = required(env, 'JWT_ACCESS_SECRET');
  const refreshSecret = required(env, 'JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');
  }
  const port = Number(env.PORT || 3000);
  return {
    port,
    publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    // Name matches the existing .env file.
    databaseUrl: required(env, 'SUPABSAE_DB_URL'),
    masterEncryptionKey: needsEncryptionKey ? parseMasterKey(required(env, 'MASTER_ENCRYPTION_KEY')) : Buffer.alloc(32),
    isProduction: env.NODE_ENV === 'production',
    webhooks: {
      enabled: env.WEBHOOK_WORKER_ENABLED !== 'false',
      pollIntervalMs: parsePollInterval(env.WEBHOOK_POLL_INTERVAL_MS),
      retryDelaysSeconds: parseRetryDelays(env.WEBHOOK_RETRY_DELAYS_SECONDS),
    },
    jwt: {
      accessSecret,
      refreshSecret,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN || '15m',
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
  };
}
