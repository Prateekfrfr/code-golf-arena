/** @typedef {{ min: number, max: number }} IntegerBounds */
/** @typedef {{ max?: number, pattern?: RegExp }} StringOptions */

/**
 * @param {string} name
 * @param {number} fallback
 * @param {IntegerBounds} bounds
 */
const readInteger = (name, fallback, { min, max }) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} must be an integer between ${min} and ${max}.`
    );
  }

  return value;
};

/**
 * @param {string} name
 * @param {string} [fallback]
 * @param {StringOptions} [options]
 */
const readString = (name, fallback = '', { max = 2_000, pattern } = {}) => {
  const value = String(process.env[name] ?? fallback).trim();
  if (value.length > max || (pattern && value && !pattern.test(value))) {
    throw new Error(`${name} is invalid.`);
  }
  return value;
};

const persistenceMode = readString('PERSISTENCE_MODE', 'memory', {
  max: 20,
  pattern: /^(memory|postgres)$/
});
const ephemeralStateMode = readString('EPHEMERAL_STATE_MODE', 'memory', {
  max: 20,
  pattern: /^(memory|redis)$/
});
const databaseUrl = readString('DATABASE_URL', '', { max: 4_000 });
const redisUrl = readString('REDIS_URL', '', { max: 4_000 });
if (persistenceMode === 'postgres' && !databaseUrl) {
  throw new Error('DATABASE_URL is required when PERSISTENCE_MODE is postgres.');
}
if (ephemeralStateMode === 'redis' && !redisUrl) {
  throw new Error('REDIS_URL is required when EPHEMERAL_STATE_MODE is redis.');
}

/** @returns {string[]} */
const readOrigins = () => {
  const configured = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS is required in production.');
  }

  return ['http://localhost:3000'];
};

export const serverConfig = Object.freeze({
  port: readInteger('PORT', 3001, { min: 1, max: 65535 }),
  corsOrigins: Object.freeze(readOrigins()),
  roomCleanupMs: readInteger('ROOM_CLEANUP_MS', 30 * 60 * 1000, {
    min: 60_000,
    max: 24 * 60 * 60 * 1000
  }),
  maxCodeBytes: readInteger('MAX_CODE_BYTES', 64 * 1024, {
    min: 1024,
    max: 1024 * 1024
  }),
  maxReplayFramesPerPlayer: readInteger('MAX_REPLAY_FRAMES', 1200, {
    min: 50,
    max: 10_000
  }),
  maxSubmissionRecordsPerRoom: readInteger('MAX_SUBMISSIONS_PER_ROOM', 500, {
    min: 20,
    max: 10_000
  }),
  executionConcurrency: readInteger('EXECUTION_CONCURRENCY', 2, {
    min: 1,
    max: 16
  }),
  outputLimitBytes: readInteger('EXECUTION_OUTPUT_LIMIT_BYTES', 64 * 1024, {
    min: 1024,
    max: 1024 * 1024
  }),
  persistenceMode,
  ephemeralStateMode,
  redis: Object.freeze({
    url: redisUrl,
    keyPrefix: readString('REDIS_KEY_PREFIX', 'code-golf-arena', {
      max: 80,
      pattern: /^[a-zA-Z0-9:_-]+$/
    }),
    roomTtlMs: readInteger('REDIS_ROOM_TTL_MS', 4 * 60 * 60 * 1000, {
      min: 60_000,
      max: 24 * 60 * 60 * 1000
    }),
    reconnectMaxDelayMs: readInteger('REDIS_RECONNECT_MAX_DELAY_MS', 10_000, {
      min: 1_000,
      max: 60_000
    })
  }),
  auth: Object.freeze({
    sessionCookieName: readString('AUTH_SESSION_COOKIE_NAME', 'cga_session', {
      max: 80,
      pattern: /^[a-zA-Z0-9_-]+$/
    }),
    sessionTtlMs: readInteger('AUTH_SESSION_TTL_MS', 7 * 24 * 60 * 60 * 1_000, {
      min: 60 * 60 * 1_000,
      max: 90 * 24 * 60 * 60 * 1_000
    }),
    bootstrapAdminEmail: readString('AUTH_BOOTSTRAP_ADMIN_EMAIL', '', {
      max: 320
    }).toLowerCase()
  }),
  database: Object.freeze({
    url: databaseUrl,
    poolMax: readInteger('DATABASE_POOL_MAX', 10, { min: 1, max: 100 }),
    idleTimeoutMs: readInteger('DATABASE_IDLE_TIMEOUT_MS', 30_000, {
      min: 1_000,
      max: 300_000
    }),
    connectionTimeoutMs: readInteger('DATABASE_CONNECTION_TIMEOUT_MS', 5_000, {
      min: 1_000,
      max: 60_000
    })
  })
});

/** @param {string | undefined | null} origin */
export const isAllowedOrigin = (origin) =>
  !origin || serverConfig.corsOrigins.includes(origin);
