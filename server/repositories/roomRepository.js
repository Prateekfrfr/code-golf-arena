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
  replay: {
    [firstPlayerId]: []
  },
  scores: {},
  antiCheatStats: {
    [firstPlayerId]: createAntiCheatStats()
  },
  antiCheatSessions: {},
  antiCheatEvents: [],
  lastSubmissionAt: {},
  problem: null,
  startTime: null,
  status: 'waiting',
  cleanupTimer: null
});

export const createInMemoryRoomRepository = () => {
  /** @type {Map<string, Room>} */
  const rooms = new Map();

  return {
    /** @param {string} roomCode @param {string} firstPlayerId @param {RoomMode} [mode] @param {string} [topic] */
    async create(roomCode, firstPlayerId, mode, topic) {
      const room = createRoomState(firstPlayerId, mode, topic);
      rooms.set(roomCode, room);
      return room;
    },

    /** @param {string} roomCode */
    async get(roomCode) {
      return rooms.get(roomCode) || null;
    },

    /** @param {string} roomCode */
    async has(roomCode) {
      return rooms.has(roomCode);
    },

    /** @param {string} roomCode @param {Room} room */
    async save(roomCode, room) {
      rooms.set(roomCode, room);
      return room;
    },

    /** @param {string} roomCode */
    async delete(roomCode) {
      const room = rooms.get(roomCode);

      if (room?.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
      }

      rooms.delete(roomCode);
    },

    async values() {
      return Array.from(rooms.entries());
    },

    /** @param {Room} room @param {string} playerId */
    async addPlayer(room, playerId) {
      if (!room.players.includes(playerId)) {
        room.players.push(playerId);
        room.replay[playerId] = [];
        room.antiCheatStats[playerId] = createAntiCheatStats();
      }
    },

    /** @param {Room} room @param {string} playerId */
    async markConnected(room, playerId) {
      if (!room.connectedPlayers.includes(playerId)) {
        room.connectedPlayers.push(playerId);
      }
    },

    /** @param {Room} room @param {string} playerId */
    async markDisconnected(room, playerId) {
      room.connectedPlayers = room.connectedPlayers.filter(
        (id) => id !== playerId
      );
    },

    /** @param {Room} room */
    async clearCleanup(room) {
      if (!room.cleanupTimer) return;
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  };
};
