export const createScoreRepository = () => ({
  updateBestScore(room, playerId, entry) {
    const existingScore = room.scores[playerId];

    if (
      existingScore &&
      (existingScore.score > entry.score ||
        (existingScore.score === entry.score &&
          existingScore.characterCount < entry.characterCount) ||
        (existingScore.score === entry.score &&
          existingScore.characterCount === entry.characterCount &&
          existingScore.runtimeMs <= entry.runtimeMs))
    ) {
      return false;
    }

    room.scores[playerId] = Object.freeze({ ...entry });
    return true;
  },

  getScores(room) {
    return { ...(room.scores || {}) };
  }
});
