import { createAntiCheatRuleEngine } from './ruleEngine.js';
import { createFocusRule } from './rules/focusRule.js';
import { createPasteRule } from './rules/pasteRule.js';
import { createSubmissionRateRule } from './rules/submissionRateRule.js';

export {
  AntiCheatActions,
  createAntiCheatRuleEngine
} from './ruleEngine.js';
export {
  AntiCheatSessionStatuses,
  createAntiCheatSession,
  isSessionInvalidated
} from './sessionState.js';
export { createFocusRule } from './rules/focusRule.js';
export { createPasteRule } from './rules/pasteRule.js';
export { createSubmissionRateRule } from './rules/submissionRateRule.js';

export const createDefaultAntiCheatRuleEngine = ({
  maxViolations = 2,
  maxEvents = 200,
  maxMetadataBytes = 4_096,
  maxUnfocusedMs = 5_000,
  largePasteThreshold = 80,
  submissionCooldownMs = 3_000
} = {}) =>
  createAntiCheatRuleEngine({
    maxViolations,
    maxEvents,
    maxMetadataBytes,
    rules: [
      createFocusRule({ maxUnfocusedMs }),
      createPasteRule({ largePasteThreshold }),
      createSubmissionRateRule({ cooldownMs: submissionCooldownMs })
    ]
  });
