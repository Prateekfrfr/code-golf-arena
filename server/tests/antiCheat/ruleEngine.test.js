import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AntiCheatActions,
  AntiCheatSessionStatuses,
  createAntiCheatRuleEngine,
  createAntiCheatSession,
  createDefaultAntiCheatRuleEngine,
  createFocusRule,
  createPasteRule,
  createSubmissionRateRule,
  isSessionInvalidated
} from '../../antiCheat/index.js';

const createSession = () =>
  createAntiCheatSession({
    sessionId: 'session-1',
    playerId: 'player-1',
    startedAt: 0
  });

test('focus rule emits first and final warnings then invalidates a long focus loss', () => {
  const engine = createDefaultAntiCheatRuleEngine({
    maxViolations: 2,
    maxUnfocusedMs: 5_000
  });
  let session = createSession();

  let outcome = engine.processEvent(session, {
    id: 'focus-1',
    type: 'focus_lost',
    timestamp: 100
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.WARNING);
  assert.equal(session.status, AntiCheatSessionStatuses.WARNED);
  assert.equal(session.violationCount, 1);

  outcome = engine.processEvent(session, {
    id: 'focus-back-1',
    type: 'focus_gained',
    timestamp: 1_000
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.NONE);

  outcome = engine.processEvent(session, {
    id: 'focus-2',
    type: 'focus_lost',
    timestamp: 2_000
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.FINAL_WARNING);
  assert.equal(session.status, AntiCheatSessionStatuses.FINAL_WARNING);
  assert.equal(session.violationCount, 2);

  outcome = engine.processEvent(session, {
    id: 'focus-check-2',
    type: 'focus_check',
    timestamp: 7_001
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.INVALIDATE);
  assert.equal(isSessionInvalidated(session), true);
  assert.equal(session.invalidatedAt, 7_001);
});

test('paste and submission-rate rules share the session violation budget', () => {
  const engine = createDefaultAntiCheatRuleEngine({
    maxViolations: 2,
    submissionCooldownMs: 3_000
  });
  let session = createSession();

  let outcome = engine.processEvent(session, {
    id: 'paste-1',
    type: 'large_paste',
    timestamp: 100,
    metadata: { characterCount: 120 }
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.WARNING);
  assert.equal(session.ruleStates.paste.pastedCharacters, 120);

  outcome = engine.processEvent(session, {
    id: 'submit-1',
    type: 'submission_attempt',
    timestamp: 200
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.NONE);

  outcome = engine.processEvent(session, {
    id: 'submit-2',
    type: 'submission_attempt',
    timestamp: 500
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.FINAL_WARNING);
  assert.equal(outcome.decision.ruleResults[0].details.remainingMs, 2_700);

  outcome = engine.processEvent(session, {
    id: 'spam-3',
    type: 'submission_spam',
    timestamp: 600
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.INVALIDATE);
  assert.equal(session.violationCount, 3);
});

test('duplicate, stale, and post-invalidation events are ignored', () => {
  const engine = createDefaultAntiCheatRuleEngine({ maxViolations: 1 });
  let session = createSession();

  let outcome = engine.processEvent(session, {
    id: 'paste-1',
    type: 'paste',
    timestamp: 100,
    metadata: { characterCount: 2 }
  });
  session = outcome.session;
  assert.equal(outcome.decision.action, AntiCheatActions.FINAL_WARNING);

  outcome = engine.processEvent(session, {
    id: 'paste-1',
    type: 'paste',
    timestamp: 100,
    metadata: { characterCount: 2 }
  });
  assert.equal(outcome.decision.code, 'duplicate_event');
  assert.equal(outcome.session, session);

  outcome = engine.processEvent(session, {
    id: 'stale',
    type: 'paste',
    timestamp: 99,
    metadata: { characterCount: 2 }
  });
  assert.equal(outcome.decision.code, 'stale_event');

  outcome = engine.processEvent(session, {
    id: 'invalidate',
    type: 'paste',
    timestamp: 101,
    metadata: { characterCount: 2 }
  });
  session = outcome.session;
  assert.equal(session.status, AntiCheatSessionStatuses.INVALIDATED);

  outcome = engine.processEvent(session, {
    id: 'after',
    type: 'paste',
    timestamp: 102,
    metadata: { characterCount: 2 }
  });
  assert.equal(outcome.decision.code, 'session_invalidated');
  assert.equal(outcome.session, session);
});

test('rule engine supports registration and replacement of custom rules', () => {
  const engine = createAntiCheatRuleEngine();
  const customRule = {
    id: 'custom',
    eventTypes: ['custom_event'],
    evaluate({ state }) {
      return {
        state: { count: (state.count ?? 0) + 1 },
        violations: 1,
        reason: 'Custom violation.'
      };
    }
  };

  engine.register(customRule);
  assert.deepEqual(engine.ruleIds(), ['custom']);
  assert.throws(() => engine.register(customRule), /already registered/);

  const outcome = engine.processEvent(createSession(), {
    type: 'custom_event',
    timestamp: 1
  });
  assert.equal(outcome.session.ruleStates.custom.count, 1);
  assert.equal(outcome.decision.action, AntiCheatActions.WARNING);
  assert.equal(engine.unregister('custom'), true);
});

test('individual rule factories validate configuration', () => {
  assert.throws(() => createFocusRule({ maxUnfocusedMs: -1 }), /non-negative/);
  assert.throws(() => createPasteRule({ largePasteThreshold: 0 }), /positive/);
  assert.throws(
    () => createSubmissionRateRule({ cooldownMs: -1 }),
    /non-negative/
  );
  assert.throws(
    () => createAntiCheatSession({ sessionId: '', playerId: 'p' }),
    /sessionId/
  );
});

test('rule engine bounds untrusted metadata', () => {
  const engine = createDefaultAntiCheatRuleEngine({
    maxMetadataBytes: 32
  });

  assert.throws(
    () =>
      engine.processEvent(createSession(), {
        type: 'paste',
        timestamp: 1,
        metadata: { value: 'x'.repeat(100) }
      }),
    /must not exceed/
  );
});
