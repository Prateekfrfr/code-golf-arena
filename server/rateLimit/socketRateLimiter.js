const DEFAULT_RULES = Object.freeze({
  roomMutation: { limit: 12, windowMs: 60_000 },
  roomRead: { limit: 90, windowMs: 60_000 },
  codeUpdate: { limit: 80, windowMs: 10_000 },
  submission: { limit: 20, windowMs: 60_000 },
  telemetry: { limit: 40, windowMs: 60_000 }
});

export const createSocketRateLimiter = ({
  rules = DEFAULT_RULES,
  now = () => Date.now()
} = {}) => {
  const buckets = new Map();

  const consume = (identity, ruleName) => {
    const rule = rules[ruleName];
    if (!rule) throw new Error(`Unknown rate-limit rule: ${ruleName}`);

    const timestamp = now();
    const key = `${identity}:${ruleName}`;
    const bucket = buckets.get(key);

    if (!bucket || timestamp >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: timestamp + rule.windowMs });
      return { allowed: true, retryAfterMs: 0, remaining: rule.limit - 1 };
    }

    if (bucket.count >= rule.limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1, bucket.resetAt - timestamp),
        remaining: 0
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      retryAfterMs: 0,
      remaining: rule.limit - bucket.count
    };
  };

  const prune = () => {
    const timestamp = now();
    for (const [key, bucket] of buckets) {
      if (timestamp >= bucket.resetAt) buckets.delete(key);
    }
  };

  return { consume, prune };
};

export { DEFAULT_RULES as SOCKET_RATE_LIMIT_RULES };
