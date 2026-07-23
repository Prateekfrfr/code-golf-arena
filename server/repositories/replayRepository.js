import { serverConfig } from '../config.js';
import { toPublicProblem } from '../problems/problemProjection.js';

export const createReplayRepository = ({
  maxFramesPerPlayer = serverConfig.maxReplayFramesPerPlayer
} = {}) => ({
  addFrame(room, playerId, frame) {
    if (!room?.replay?.[playerId]) return;

    const frames = room.replay[playerId];
    frames.push({
      code: frame.code,
      language: frame.language,
      timestamp: Math.max(0, Date.now() - room.startTime)
    });

    if (frames.length > maxFramesPerPlayer) {
      frames.splice(0, frames.length - maxFramesPerPlayer);
    }
  },

  getPayload(room) {
    return {
      replay: room.replay,
      players: room.players,
      problem: room.problem ? toPublicProblem(room.problem) : null,
      scores: room.scores || {},
      antiCheatStats: room.antiCheatStats || {},
      startTime: room.startTime,
      mode: room.mode,
      topic: room.topic
    };
  }
});
