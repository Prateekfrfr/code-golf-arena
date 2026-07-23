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
  })
});

export const isAllowedOrigin = (origin) =>
  !origin || serverConfig.corsOrigins.includes(origin);
