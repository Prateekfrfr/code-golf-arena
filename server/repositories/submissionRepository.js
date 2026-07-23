import crypto from 'node:crypto';

const compareLeaderboardEntries = (left, right) => {
  if (left.score !== right.score) return right.score - left.score;
  if (left.characterCount !== right.characterCount) {
    return left.characterCount - right.characterCount;
  }
  if (left.runtimeMs !== right.runtimeMs) return left.runtimeMs - right.runtimeMs;
  if (left.submittedAt !== right.submittedAt) {
    return left.submittedAt - right.submittedAt;
  }
  return left.id.localeCompare(right.id);
};

export const createSubmissionRepository = ({ maxPerRoom = 500 } = {}) => {
  const byRoom = new Map();

  const add = (roomCode, record) => {
    const submissions = byRoom.get(roomCode) || [];
    const stored = Object.freeze({
      ...record,
      id: record.id || crypto.randomUUID(),
      submittedAt: record.submittedAt || Date.now()
    });

    submissions.push(stored);
    if (submissions.length > maxPerRoom) {
      submissions.splice(0, submissions.length - maxPerRoom);
    }
    byRoom.set(roomCode, submissions);
    return stored;
  };

  const list = (roomCode) => [...(byRoom.get(roomCode) || [])];

  const getAccepted = (roomCode) =>
    list(roomCode).filter((submission) => submission.success);

  const getLeaderboard = (roomCode, { language } = {}) => {
    const bestByPlayer = new Map();

    for (const submission of getAccepted(roomCode)) {
      if (language && submission.language !== language) continue;
      const current = bestByPlayer.get(submission.playerId);
      if (
        !current ||
        compareLeaderboardEntries(submission, current) < 0
      ) {
        bestByPlayer.set(submission.playerId, submission);
      }
    }

    return [...bestByPlayer.values()].sort(compareLeaderboardEntries);
  };

  const deleteRoom = (roomCode) => byRoom.delete(roomCode);

  return {
    add,
    list,
    getAccepted,
    getLeaderboard,
    deleteRoom
  };
};

export { compareLeaderboardEntries };
