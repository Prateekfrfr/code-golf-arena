const assertTimestamp = (value, name) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
};

export const AntiCheatSessionStatuses = Object.freeze({
  ACTIVE: 'active',
  WARNED: 'warned',
  FINAL_WARNING: 'final_warning',
  INVALIDATED: 'invalidated'
});

export const createAntiCheatSession = ({
  sessionId,
  playerId,
  startedAt = 0
} = {}) => {
  const normalizedSessionId = String(sessionId || '').trim();
  const normalizedPlayerId = String(playerId || '').trim();

  if (!normalizedSessionId) {
    throw new TypeError('sessionId is required');
  }

  if (!normalizedPlayerId) {
    throw new TypeError('playerId is required');
  }

  assertTimestamp(startedAt, 'startedAt');

  return {
    sessionId: normalizedSessionId,
    playerId: normalizedPlayerId,
    startedAt,
    status: AntiCheatSessionStatuses.ACTIVE,
    violationCount: 0,
    warningCount: 0,
    invalidatedAt: null,
    invalidationReason: null,
    lastEventAt: null,
    lastDecision: null,
    ruleStates: Object.create(null),
    eventLog: [],
    recentEventIds: []
  };
};

export const isSessionInvalidated = (session) =>
  session?.status === AntiCheatSessionStatuses.INVALIDATED;
