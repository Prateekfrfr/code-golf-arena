const PASTE_EVENT_TYPES = Object.freeze([
  'paste',
  'large_paste',
  'drop_insert'
]);

const readCharacterCount = (metadata) => {
  const value =
    metadata.characterCount ?? metadata.length ?? metadata.textLength ?? 0;

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(
      'paste character count must be a non-negative safe integer'
    );
  }

  return value;
};

export const createPasteRule = ({ largePasteThreshold = 80 } = {}) => {
  if (
    !Number.isSafeInteger(largePasteThreshold) ||
    largePasteThreshold < 1
  ) {
    throw new RangeError('largePasteThreshold must be a positive safe integer');
  }

  return Object.freeze({
    id: 'paste',
    eventTypes: PASTE_EVENT_TYPES,

    evaluate({ event, state }) {
      const characterCount = readCharacterCount(event.metadata);
      const attempts = (state.attempts ?? 0) + 1;
      const pastedCharacters = (state.pastedCharacters ?? 0) + characterCount;
      const isLarge =
        event.type === 'large_paste' ||
        characterCount >= largePasteThreshold;

      return {
        state: {
          attempts,
          pastedCharacters,
          largestPaste: Math.max(state.largestPaste ?? 0, characterCount)
        },
        violations: 1,
        reason: isLarge
          ? `A large paste attempt of ${characterCount} characters was detected.`
          : 'A paste or drag-drop insertion attempt was detected.',
        details: {
          characterCount,
          largePasteThreshold,
          isLarge
        }
      };
    }
  });
};
