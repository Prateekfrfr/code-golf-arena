const FOCUS_EVENT_TYPES = Object.freeze([
  'focus_lost',
  'focus_gained',
  'focus_check',
  'tab_switch'
]);

const readDuration = (metadata) => {
  const duration = metadata.durationMs;

  if (duration === undefined || duration === null) return null;
  if (!Number.isSafeInteger(duration) || duration < 0) {
    throw new TypeError('focus durationMs must be a non-negative safe integer');
  }

  return duration;
};

export const createFocusRule = ({ maxUnfocusedMs = 5_000 } = {}) => {
  if (!Number.isSafeInteger(maxUnfocusedMs) || maxUnfocusedMs < 0) {
    throw new RangeError('maxUnfocusedMs must be a non-negative safe integer');
  }

  return Object.freeze({
    id: 'focus',
    eventTypes: FOCUS_EVENT_TYPES,

    evaluate({ event, state }) {
      const currentState = {
        lostAt: state.lostAt ?? null,
        focusLosses: state.focusLosses ?? 0,
        longestUnfocusedMs: state.longestUnfocusedMs ?? 0
      };

      if (event.type === 'focus_lost') {
        if (currentState.lostAt !== null) {
          return {
            state: currentState,
            violations: 0,
            reason: 'Focus is already marked as lost.'
          };
        }

        return {
          state: {
            ...currentState,
            lostAt: event.timestamp,
            focusLosses: currentState.focusLosses + 1
          },
          violations: 1,
          reason: 'The coding window lost focus.'
        };
      }

      if (event.type === 'tab_switch') {
        const duration = readDuration(event.metadata) ?? 0;

        return {
          state: {
            ...currentState,
            focusLosses: currentState.focusLosses + 1,
            longestUnfocusedMs: Math.max(
              currentState.longestUnfocusedMs,
              duration
            )
          },
          violations: 1,
          invalidate: duration > maxUnfocusedMs,
          reason:
            duration > maxUnfocusedMs
              ? `The coding window was unfocused for ${duration}ms.`
              : 'A tab switch was detected.',
          details: { durationMs: duration, maxUnfocusedMs }
        };
      }

      if (currentState.lostAt === null) {
        return {
          state: currentState,
          violations: 0,
          reason: 'No active focus loss was recorded.'
        };
      }

      const duration = Math.max(0, event.timestamp - currentState.lostAt);
      const shouldInvalidate = duration > maxUnfocusedMs;

      return {
        state: {
          ...currentState,
          lostAt: event.type === 'focus_gained' ? null : currentState.lostAt,
          longestUnfocusedMs: Math.max(
            currentState.longestUnfocusedMs,
            duration
          )
        },
        violations: 0,
        invalidate: shouldInvalidate,
        reason: shouldInvalidate
          ? `The coding window was unfocused for ${duration}ms.`
          : event.type === 'focus_gained'
            ? 'Focus returned within the allowed duration.'
            : 'The focus-loss duration remains within the allowed limit.',
        details: { durationMs: duration, maxUnfocusedMs }
      };
    }
  });
};
