import { problems } from '../../data/problems.js';

export const createLocalProblemProvider = () => ({
  async getRandomProblem() {
    return problems[Math.floor(Math.random() * problems.length)];
  }
});
