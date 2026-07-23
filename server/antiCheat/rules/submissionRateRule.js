const SUBMISSION_EVENT_TYPES = Object.freeze([
  'submission_attempt',
  'submission_spam'
]);

export const createSubmissionRateRule = ({ cooldownMs = 3_000 } = {}) => {
  if (!Number.isSafeInteger(cooldownMs) || cooldownMs < 0) {
    throw new RangeError('cooldownMs must be a non-negative safe integer');
  }

  return Object.freeze({
    id: 'submission_rate',
    eventTypes: SUBMISSION_EVENT_TYPES,

    evaluate({ event, state }) {
      const currentState = {
        lastAllowedAt: state.lastAllowedAt ?? null,
        attempts: state.attempts ?? 0,
        blockedAttempts: state.blockedAttempts ?? 0
      };

      if (event.type === 'submission_spam') {
        return {
          state: {
            ...currentState,
            attempts: currentState.attempts + 1,
            blockedAttempts: currentState.blockedAttempts + 1
          },
          violations: 1,
          reason: 'A submission-rate violation was reported.',
          details: { cooldownMs }
        };
      }

      if (
        currentState.lastAllowedAt === null ||
        event.timestamp - currentState.lastAllowedAt >= cooldownMs
      ) {
        return {
          state: {
            ...currentState,
            lastAllowedAt: event.timestamp,
            attempts: currentState.attempts + 1
          },
          violations: 0,
          reason: 'Submission attempt is within the allowed rate.',
          details: { cooldownMs, remainingMs: 0 }
        };
      }

      const remainingMs =
        cooldownMs - (event.timestamp - currentState.lastAllowedAt);

      return {
        state: {
          ...currentState,
          attempts: currentState.attempts + 1,
          blockedAttempts: currentState.blockedAttempts + 1
        },
        violations: 1,
        reason: `Submission attempted ${remainingMs}ms before cooldown expiry.`,
        details: { cooldownMs, remainingMs }
      };
    }
  });
};
