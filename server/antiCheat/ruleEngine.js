import {
  AntiCheatSessionStatuses,
  isSessionInvalidated
} from './sessionState.js';

export const AntiCheatActions = Object.freeze({
  NONE: 'none',
  WARNING: 'warning',
  FINAL_WARNING: 'final_warning',
  INVALIDATE: 'invalidate'
});

const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_METADATA_BYTES = 4_096;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeEvent = (event, maxMetadataBytes) => {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('event must be an object');
  }

  const type = String(event.type || '').trim().toLowerCase();

  if (!EVENT_TYPE_PATTERN.test(type)) {
    throw new TypeError('event.type is invalid');
  }

  if (!Number.isSafeInteger(event.timestamp) || event.timestamp < 0) {
    throw new TypeError('event.timestamp must be a non-negative safe integer');
  }

  const id =
    event.id === undefined || event.id === null ? null : String(event.id).trim();

  if (id !== null && (id.length === 0 || id.length > 128)) {
    throw new TypeError('event.id must contain between 1 and 128 characters');
  }

  const metadata = event.metadata ?? {};

  if (!isPlainObject(metadata)) {
    throw new TypeError('event.metadata must be a plain object');
  }

  let serializedMetadata;

  try {
    serializedMetadata = JSON.stringify(metadata);
  } catch {
    throw new TypeError('event.metadata must be JSON serializable');
  }

  if (Buffer.byteLength(serializedMetadata, 'utf8') > maxMetadataBytes) {
    throw new RangeError(
      `event.metadata must not exceed ${maxMetadataBytes} bytes`
    );
  }

  return Object.freeze({
    id,
    type,
    timestamp: event.timestamp,
    metadata: Object.freeze({ ...metadata })
  });
};

const validateRule = (rule) => {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new TypeError('rule must be an object');
  }

  const id = String(rule.id || '').trim();

  if (!id || !EVENT_TYPE_PATTERN.test(id)) {
    throw new TypeError('rule.id is invalid');
  }

  if (!Array.isArray(rule.eventTypes) || rule.eventTypes.length === 0) {
    throw new TypeError(`rule ${id} must declare eventTypes`);
  }

  const eventTypes = new Set(
    rule.eventTypes.map((type) => String(type || '').trim().toLowerCase())
  );

  for (const eventType of eventTypes) {
    if (!EVENT_TYPE_PATTERN.test(eventType)) {
      throw new TypeError(`rule ${id} declares an invalid event type`);
    }
  }

  if (typeof rule.evaluate !== 'function') {
    throw new TypeError(`rule ${id} must define evaluate`);
  }

  return {
    id,
    eventTypes,
    evaluate: rule.evaluate.bind(rule)
  };
};

const validateRuleResult = (ruleId, result) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TypeError(`rule ${ruleId} returned an invalid result`);
  }

  const violations = result.violations ?? 0;

  if (
    !Number.isSafeInteger(violations) ||
    violations < 0 ||
    violations > 10
  ) {
    throw new RangeError(
      `rule ${ruleId} violations must be an integer between 0 and 10`
    );
  }

  if (
    result.state !== undefined &&
    (!result.state ||
      typeof result.state !== 'object' ||
      Array.isArray(result.state))
  ) {
    throw new TypeError(`rule ${ruleId} state must be an object`);
  }

  return {
    state: result.state ?? {},
    violations,
    invalidate: result.invalidate === true,
    reason: String(result.reason || '').trim() || null,
    details:
      result.details && typeof result.details === 'object'
        ? { ...result.details }
        : null
  };
};

const ignoredDecision = (event, code, reason) => ({
  action: AntiCheatActions.NONE,
  code,
  event,
  ignored: true,
  violationsAdded: 0,
  violationsTotal: null,
  reasons: [reason],
  ruleResults: []
});

export const createAntiCheatRuleEngine = ({
  rules = [],
  maxViolations = 2,
  maxEvents = DEFAULT_MAX_EVENTS,
  maxMetadataBytes = DEFAULT_MAX_METADATA_BYTES
} = {}) => {
  if (!Number.isSafeInteger(maxViolations) || maxViolations < 1) {
    throw new RangeError('maxViolations must be a positive safe integer');
  }

  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > 10_000) {
    throw new RangeError('maxEvents must be between 1 and 10000');
  }

  if (
    !Number.isSafeInteger(maxMetadataBytes) ||
    maxMetadataBytes < 1 ||
    maxMetadataBytes > 65_536
  ) {
    throw new RangeError('maxMetadataBytes must be between 1 and 65536');
  }

  const registeredRules = new Map();

  const register = (rule, { replace = false } = {}) => {
    const validated = validateRule(rule);

    if (registeredRules.has(validated.id) && !replace) {
      throw new Error(`anti-cheat rule already registered: ${validated.id}`);
    }

    registeredRules.set(validated.id, validated);
    return validated.id;
  };

  for (const rule of rules) {
    register(rule);
  }

  const processEvent = (session, inputEvent) => {
    if (!session || typeof session !== 'object' || Array.isArray(session)) {
      throw new TypeError('session must be created with createAntiCheatSession');
    }

    const event = normalizeEvent(inputEvent, maxMetadataBytes);

    if (isSessionInvalidated(session)) {
      return {
        session,
        decision: ignoredDecision(
          event,
          'session_invalidated',
          'Session is already invalidated.'
        )
      };
    }

    if (event.id !== null && session.recentEventIds.includes(event.id)) {
      return {
        session,
        decision: ignoredDecision(
          event,
          'duplicate_event',
          'Duplicate event ignored.'
        )
      };
    }

    if (session.lastEventAt !== null && event.timestamp < session.lastEventAt) {
      return {
        session,
        decision: ignoredDecision(
          event,
          'stale_event',
          'Out-of-order event ignored.'
        )
      };
    }

    const nextRuleStates = {
      ...(session.ruleStates || Object.create(null))
    };
    const ruleResults = [];
    let violationsAdded = 0;
    let invalidate = false;

    for (const rule of registeredRules.values()) {
      if (!rule.eventTypes.has(event.type)) continue;

      const result = validateRuleResult(
        rule.id,
        rule.evaluate({
          event,
          state: nextRuleStates[rule.id] || {},
          session
        })
      );

      nextRuleStates[rule.id] = result.state;
      violationsAdded += result.violations;
      invalidate ||= result.invalidate;
      ruleResults.push({
        ruleId: rule.id,
        violations: result.violations,
        invalidate: result.invalidate,
        reason: result.reason,
        details: result.details
      });
    }

    const violationsTotal = session.violationCount + violationsAdded;
    let action = AntiCheatActions.NONE;

    if (invalidate || violationsTotal > maxViolations) {
      action = AntiCheatActions.INVALIDATE;
    } else if (violationsAdded > 0 && violationsTotal === maxViolations) {
      action = AntiCheatActions.FINAL_WARNING;
    } else if (violationsAdded > 0) {
      action = AntiCheatActions.WARNING;
    }

    const reasons = ruleResults
      .map((result) => result.reason)
      .filter(Boolean);
    const decision = {
      action,
      code:
        action === AntiCheatActions.NONE
          ? 'no_violation'
          : action === AntiCheatActions.INVALIDATE
            ? 'session_invalidated'
            : 'violation_recorded',
      event,
      ignored: false,
      violationsAdded,
      violationsTotal,
      reasons,
      ruleResults
    };
    const nextEventLog = [
      ...(session.eventLog || []),
      {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        action,
        violationsAdded,
        ruleIds: ruleResults.map((result) => result.ruleId)
      }
    ].slice(-maxEvents);
    const nextRecentEventIds =
      event.id === null
        ? [...(session.recentEventIds || [])]
        : [...(session.recentEventIds || []), event.id].slice(-maxEvents);
    const nextStatus =
      action === AntiCheatActions.INVALIDATE
        ? AntiCheatSessionStatuses.INVALIDATED
        : action === AntiCheatActions.FINAL_WARNING
          ? AntiCheatSessionStatuses.FINAL_WARNING
          : action === AntiCheatActions.WARNING &&
              session.status === AntiCheatSessionStatuses.ACTIVE
            ? AntiCheatSessionStatuses.WARNED
            : session.status;
    const nextSession = {
      ...session,
      status: nextStatus,
      violationCount: violationsTotal,
      warningCount:
        session.warningCount +
        (action === AntiCheatActions.WARNING ||
        action === AntiCheatActions.FINAL_WARNING
          ? 1
          : 0),
      invalidatedAt:
        action === AntiCheatActions.INVALIDATE
          ? event.timestamp
          : session.invalidatedAt,
      invalidationReason:
        action === AntiCheatActions.INVALIDATE
          ? reasons.join(' ') || 'Anti-cheat policy exceeded.'
          : session.invalidationReason,
      lastEventAt: event.timestamp,
      lastDecision: decision,
      ruleStates: nextRuleStates,
      eventLog: nextEventLog,
      recentEventIds: nextRecentEventIds
    };

    return {
      session: nextSession,
      decision
    };
  };

  return Object.freeze({
    register,

    unregister(ruleId) {
      return registeredRules.delete(String(ruleId || '').trim());
    },

    ruleIds() {
      return [...registeredRules.keys()].sort();
    },

    processEvent
  });
};
