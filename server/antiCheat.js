import { AntiCheatEventTypes } from '../shared/events.js';

export const ANTI_CHEAT_CONFIG = {
  largePasteThreshold: 80,
  submissionCooldownMs: 3000
};

const ensureStats = (room, playerId) => {
  room.antiCheatStats[playerId] = room.antiCheatStats[playerId] || {
    tabSwitches: 0,
    suspiciousPastes: 0,
    submissionSpamAttempts: 0
  };

  return room.antiCheatStats[playerId];
};

export const recordAntiCheatEvent = (room, playerId, type, metadata = {}) => {
  const stats = ensureStats(room, playerId);

  if (type === AntiCheatEventTypes.TAB_SWITCH) {
    stats.tabSwitches += 1;
  }

  if (type === AntiCheatEventTypes.LARGE_PASTE) {
    stats.suspiciousPastes += 1;
  }

  if (type === AntiCheatEventTypes.SUBMISSION_SPAM) {
    stats.submissionSpamAttempts += 1;
  }

  const event = {
    playerId,
    type,
    metadata,
    timestamp: Date.now()
  };

  room.antiCheatEvents.push(event);

  return {
    event,
    stats
  };
};

export const getAntiCheatSummary = (room) => ({
  stats: room.antiCheatStats || {},
  events: room.antiCheatEvents || []
});
