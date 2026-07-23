import { SUPPORTED_LANGUAGES } from '../../shared/events.js';

const ROOM_CODE_PATTERN = /^[A-Z0-9]{6,12}$/;
const TOPIC_PATTERN = /^[a-z0-9-]{1,40}$/;
const MAX_METADATA_KEYS = 12;
const MAX_METADATA_VALUE_LENGTH = 240;
const languageSet = new Set(SUPPORTED_LANGUAGES);

export class PayloadValidationError extends Error {
  constructor(message, code = 'INVALID_PAYLOAD') {
    super(message);
    this.name = 'PayloadValidationError';
    this.code = code;
  }
}

const asBoundedString = (
  value,
  { field, min = 0, max, trim = false }
) => {
  if (typeof value !== 'string') {
    throw new PayloadValidationError(`${field} must be a string.`);
  }

  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) {
    throw new PayloadValidationError(
      `${field} must contain between ${min} and ${max} characters.`
    );
  }

  return normalized;
};

export const parseRoomCode = (value) => {
  const roomCode = asBoundedString(String(value ?? ''), {
    field: 'roomCode',
    min: 6,
    max: 12,
    trim: true
  }).toUpperCase();

  if (!ROOM_CODE_PATTERN.test(roomCode)) {
    throw new PayloadValidationError('roomCode has an invalid format.');
  }

  return roomCode;
};

export const parseTopic = (value) => {
  const topic = asBoundedString(String(value ?? 'random'), {
    field: 'topic',
    min: 1,
    max: 40,
    trim: true
  }).toLowerCase();

  if (!TOPIC_PATTERN.test(topic)) {
    throw new PayloadValidationError('topic has an invalid format.');
  }

  return topic;
};

export const parseLanguage = (value) => {
  const language = String(value ?? 'python').trim().toLowerCase();
  if (!languageSet.has(language)) {
    throw new PayloadValidationError('language is not supported.');
  }
  return language;
};

export const parseCodeUpdate = (payload, maxCodeBytes) => {
  const roomCode = parseRoomCode(payload?.roomCode);
  const code = asBoundedString(String(payload?.code ?? ''), {
    field: 'code',
    max: maxCodeBytes
  });

  if (Buffer.byteLength(code, 'utf8') > maxCodeBytes) {
    throw new PayloadValidationError(
      `code must be at most ${maxCodeBytes} UTF-8 bytes.`,
      'CODE_TOO_LARGE'
    );
  }

  return {
    roomCode,
    code,
    language: parseLanguage(payload?.language)
  };
};

export const parseMetadata = (value) => {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new PayloadValidationError('metadata must be an object.');
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_METADATA_KEYS) {
    throw new PayloadValidationError('metadata contains too many fields.');
  }

  return Object.fromEntries(
    entries.map(([key, entryValue]) => {
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) {
        throw new PayloadValidationError('metadata contains an invalid key.');
      }

      if (
        typeof entryValue !== 'string' &&
        typeof entryValue !== 'number' &&
        typeof entryValue !== 'boolean'
      ) {
        throw new PayloadValidationError(
          'metadata values must be strings, numbers, or booleans.'
        );
      }

      const normalized =
        typeof entryValue === 'string'
          ? entryValue.slice(0, MAX_METADATA_VALUE_LENGTH)
          : entryValue;

      return [key, normalized];
    })
  );
};

export const parseAntiCheatEvent = (payload, allowedTypes) => {
  const type = String(payload?.type ?? '');
  if (!allowedTypes.has(type)) {
    throw new PayloadValidationError('anti-cheat event type is invalid.');
  }

  return {
    roomCode: parseRoomCode(payload?.roomCode),
    type,
    metadata: parseMetadata(payload?.metadata)
  };
};
