import { problems } from '../../data/problems.js';

const normalizeTopic = (topic) => String(topic || '').trim().toLowerCase();

export const createLocalProblemProvider = () => ({
  async getRandomProblem(topic) {
    const normalizedTopic = normalizeTopic(topic);
    const candidates =
      normalizedTopic && normalizedTopic !== 'random'
        ? problems.filter((problem) => problem.topic === normalizedTopic)
        : problems;

    const pool = candidates.length > 0 ? candidates : problems;
    return pool[Math.floor(Math.random() * pool.length)];
  }
});
