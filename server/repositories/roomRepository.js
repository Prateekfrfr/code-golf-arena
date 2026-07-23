const createAntiCheatStats = () => ({
  tabSwitches: 0,
  suspiciousPastes: 0,
  submissionSpamAttempts: 0
});

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
  const rooms = new Map();

  return {
    create(roomCode, firstPlayerId, mode, topic) {
      const room = createRoomState(firstPlayerId, mode, topic);
      rooms.set(roomCode, room);
      return room;
    },

    get(roomCode) {
      return rooms.get(roomCode) || null;
    },

    has(roomCode) {
      return rooms.has(roomCode);
    },

    delete(roomCode) {
      const room = rooms.get(roomCode);

      if (room?.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
      }

      rooms.delete(roomCode);
    },

    values() {
      return Array.from(rooms.entries());
    },

    addPlayer(room, playerId) {
      if (!room.players.includes(playerId)) {
        room.players.push(playerId);
        room.replay[playerId] = [];
        room.antiCheatStats[playerId] = createAntiCheatStats();
      }
    },

    markConnected(room, playerId) {
      if (!room.connectedPlayers.includes(playerId)) {
        room.connectedPlayers.push(playerId);
      }
    },

    markDisconnected(room, playerId) {
      room.connectedPlayers = room.connectedPlayers.filter(
        (id) => id !== playerId
      );
    },

    clearCleanup(room) {
      if (!room.cleanupTimer) return;
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  };
};
