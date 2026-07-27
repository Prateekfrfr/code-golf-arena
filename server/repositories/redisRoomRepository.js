/** @typedef {'multiplayer' | 'solo'} RoomMode */
/** @typedef {{ tabSwitches: number, suspiciousPastes: number, submissionSpamAttempts: number }} AntiCheatStats */
/** @typedef {{
 * mode: RoomMode,
 * topic: string,
 * players: string[],
 * connectedPlayers: string[],
 * replay: Record<string, unknown[]>,
 * scores: Record<string, unknown>,
 * antiCheatStats: Record<string, AntiCheatStats>,
 * antiCheatSessions: Record<string, unknown>,
 * antiCheatEvents: unknown[],
 * lastSubmissionAt: Record<string, unknown>,
 * problem: unknown | null,
 * startTime: number | null,
 * status: string,
 * cleanupTimer: ReturnType<typeof setTimeout> | null
 * }} Room */

/**
 * The small interface used here is intentionally compatible with the node-redis
 * client. Keeping it injected makes the repository independently testable and
 * prevents it from owning a network connection lifecycle.
 * @typedef {{
 * get(key: string): Promise<string | null>,
 * set(key: string, value: string, options: { EX: number }): Promise<unknown>,
 * del(key: string): Promise<unknown>,
 * exists(key: string): Promise<number>,
 * scanIterator(options: { MATCH: string }): AsyncIterable<string>
 * }} RedisRoomClient
 */

const ROOM_REFERENCE = Symbol('redisRoomCode');
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DEFAULT_NAMESPACE = 'code-golf-arena:room';
const DEFAULT_TTL_SECONDS = 60 * 60 * 6;
const MAX_SERIALIZED_ROOM_BYTES = 1_000_000;

/** @returns {AntiCheatStats} */
const createAntiCheatStats = () => ({
  tabSwitches: 0,
  suspiciousPastes: 0,
  submissionSpamAttempts: 0
});

/** @param {string} firstPlayerId @param {RoomMode} [mode] @param {string} [topic] @returns {Room} */
const createRoomState = (firstPlayerId, mode = 'multiplayer', topic = 'random') => ({
  mode,
  topic,
  players: [firstPlayerId],
  connectedPlayers: [firstPlayerId],
  replay: { [firstPlayerId]: [] },
  scores: {},
  antiCheatStats: { [firstPlayerId]: createAntiCheatStats() },
  antiCheatSessions: {},
  antiCheatEvents: [],
  lastSubmissionAt: {},
  problem: null,
  startTime: null,
  status: 'waiting',
  cleanupTimer: null
});

/** @param {unknown} value @param {number} [depth] @returns {unknown} */
const copySafeJsonValue = (value, depth = 0) => {
  if (depth > 40) throw new TypeError('Stored room JSON is too deeply nested.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Stored room JSON has an invalid number.');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => copySafeJsonValue(entry, depth + 1));
  }
  if (typeof value !== 'object') throw new TypeError('Stored room JSON has an invalid value.');

  /** @type {Record<string, unknown>} */
  const safe = {};
  for (const [key, entry] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new TypeError('Stored room JSON has a prohibited property.');
    }
    safe[key] = copySafeJsonValue(entry, depth + 1);
  }
  return safe;
};

/** @param {string} roomCode */
const assertRoomCode = (roomCode) => {
  if (typeof roomCode !== 'string' || roomCode.length === 0 || roomCode.length > 128) {
    throw new TypeError('Room code must be a non-empty string up to 128 characters.');
  }
};

/** @param {string} playerId */
const assertPlayerId = (playerId) => {
  if (
    typeof playerId !== 'string' ||
    playerId.length === 0 ||
    playerId.length > 256 ||
    DANGEROUS_KEYS.has(playerId)
  ) {
    throw new TypeError('Player ID must be a safe non-empty string up to 256 characters.');
  }
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value @returns {Room} */
const parseStoredRoom = (value) => {
  if (!isRecord(value)) throw new TypeError('Stored room JSON must be an object.');
  const room = /** @type {Room} */ (copySafeJsonValue(value));
  if (
    (room.mode !== 'multiplayer' && room.mode !== 'solo') ||
    typeof room.topic !== 'string' ||
    typeof room.status !== 'string' ||
    (room.startTime !== null && (typeof room.startTime !== 'number' || !Number.isFinite(room.startTime))) ||
    !Array.isArray(room.players) ||
    !room.players.every((playerId) => typeof playerId === 'string' && !DANGEROUS_KEYS.has(playerId)) ||
    !Array.isArray(room.connectedPlayers) ||
    !room.connectedPlayers.every((playerId) => typeof playerId === 'string' && !DANGEROUS_KEYS.has(playerId)) ||
    !isRecord(room.replay) ||
    !isRecord(room.scores) ||
    !isRecord(room.antiCheatStats) ||
    !isRecord(room.antiCheatSessions) ||
    !Array.isArray(room.antiCheatEvents) ||
    !isRecord(room.lastSubmissionAt)
  ) {
    throw new TypeError('Stored room JSON has an invalid room shape.');
  }
  room.cleanupTimer = null;
  return room;
};

/** @param {Room} room @returns {string} */
const serializeRoom = (room) => {
  const persistedRoom = copySafeJsonValue({ ...room, cleanupTimer: null });
  const serialized = JSON.stringify(persistedRoom);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_ROOM_BYTES) {
    throw new RangeError('Room state exceeds the maximum persisted size.');
  }
  return serialized;
};

/** @param {Room} room @param {string} roomCode @returns {Room} */
const attachRoomCode = (room, roomCode) => {
  Object.defineProperty(room, ROOM_REFERENCE, {
    value: roomCode,
    enumerable: false,
    configurable: true
  });
  return room;
};

/** @param {Room} room */
const getAttachedRoomCode = (room) => {
  const roomCode = /** @type {unknown} */ (Reflect.get(room, ROOM_REFERENCE));
  if (typeof roomCode !== 'string') {
    throw new TypeError('Room is not managed by this Redis repository.');
  }
  return roomCode;
};

/**
 * @param {{ client: RedisRoomClient, namespace?: string, ttlSeconds?: number }} options
 */
export const createRedisRoomRepository = ({
  client,
  namespace = DEFAULT_NAMESPACE,
  ttlSeconds = DEFAULT_TTL_SECONDS
}) => {
  if (!client) throw new TypeError('A Redis client is required.');
  if (typeof namespace !== 'string' || !/^[a-z0-9:_-]+$/i.test(namespace)) {
    throw new TypeError('Redis room namespace contains unsupported characters.');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 60 * 60 * 24 * 30) {
    throw new TypeError('Redis room TTL must be an integer between 1 second and 30 days.');
  }

  /** @param {string} roomCode */
  const keyFor = (roomCode) => {
    assertRoomCode(roomCode);
    return `${namespace}:${encodeURIComponent(roomCode)}`;
  };

  /** @param {string} roomCode @param {Room} room */
  const save = async (roomCode, room) => {
    assertRoomCode(roomCode);
    if (!isRecord(room)) throw new TypeError('Room must be an object.');
    attachRoomCode(room, roomCode);
    await client.set(keyFor(roomCode), serializeRoom(room), { EX: ttlSeconds });
    return room;
  };

  /** @param {Room} room */
  const saveAttachedRoom = async (room) => save(getAttachedRoomCode(room), room);

  /** @param {string} roomCode */
  const get = async (roomCode) => {
    const serialized = await client.get(keyFor(roomCode));
    if (serialized === null) return null;
    if (typeof serialized !== 'string') {
      throw new TypeError('Stored room state must be a string.');
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_SERIALIZED_ROOM_BYTES) {
      throw new RangeError('Stored room state exceeds the maximum supported size.');
    }

    let parsed;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      throw new TypeError('Stored room state is not valid JSON.');
    }
    return attachRoomCode(parseStoredRoom(parsed), roomCode);
  };

  return {
    /** @param {string} roomCode @param {string} firstPlayerId @param {RoomMode} [mode] @param {string} [topic] */
    async create(roomCode, firstPlayerId, mode, topic) {
      assertRoomCode(roomCode);
      assertPlayerId(firstPlayerId);
      const room = attachRoomCode(createRoomState(firstPlayerId, mode, topic), roomCode);
      return save(roomCode, room);
    },

    /** @param {string} roomCode */
    get,

    /** @param {string} roomCode */
    async has(roomCode) {
      return (await client.exists(keyFor(roomCode))) > 0;
    },

    /** @param {string} roomCode */
    async delete(roomCode) {
      await client.del(keyFor(roomCode));
    },

    async values() {
      /** @type {Array<[string, Room]>} */
      const rooms = [];
      const prefix = `${namespace}:`;
      for await (const key of client.scanIterator({ MATCH: `${prefix}*` })) {
        if (!key.startsWith(prefix)) continue;
        const encodedRoomCode = key.slice(prefix.length);
        let roomCode;
        try {
          roomCode = decodeURIComponent(encodedRoomCode);
          assertRoomCode(roomCode);
        } catch {
          continue;
        }
        const room = await get(roomCode);
        if (room) rooms.push([roomCode, room]);
      }
      return rooms;
    },

    save,

    /** @param {Room} room @param {string} playerId */
    async addPlayer(room, playerId) {
      assertPlayerId(playerId);
      if (!room.players.includes(playerId)) {
        room.players.push(playerId);
        room.replay[playerId] = [];
        room.antiCheatStats[playerId] = createAntiCheatStats();
      }
      await saveAttachedRoom(room);
    },

    /** @param {Room} room @param {string} playerId */
    async markConnected(room, playerId) {
      if (!room.connectedPlayers.includes(playerId)) room.connectedPlayers.push(playerId);
      await saveAttachedRoom(room);
    },

    /** @param {Room} room @param {string} playerId */
    async markDisconnected(room, playerId) {
      room.connectedPlayers = room.connectedPlayers.filter((id) => id !== playerId);
      await saveAttachedRoom(room);
    },

    /** @param {Room} room */
    async clearCleanup(room) {
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }
      await saveAttachedRoom(room);
    }
  };
};
