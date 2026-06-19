export const createScoreRepository = () => ({
  updateBestScore(room, playerId, entry) {
    const existingScore = room.scores[playerId];

    if (existingScore && existingScore.score <= entry.score) {
      return false;
    }

    room.scores[playerId] = entry;
    return true;
  },

  getScores(room) {
    return room.scores || {};
  }
});
