export const createReplayRepository = () => ({
  addFrame(room, playerId, frame) {
    if (!room?.replay?.[playerId]) return;

    room.replay[playerId].push({
      code: frame.code,
      language: frame.language,
      timestamp: Math.max(0, Date.now() - room.startTime)
    });
  },

  getPayload(room) {
    return {
      replay: room.replay,
      players: room.players,
      problem: room.problem,
      scores: room.scores || {},
      antiCheatStats: room.antiCheatStats || {},
      startTime: room.startTime,
      mode: room.mode
    };
  }
});
