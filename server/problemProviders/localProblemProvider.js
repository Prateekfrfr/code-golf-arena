import { problems } from '../../data/problems.js';
import { createProblemCatalog } from '../problems/catalog.js';

const normalizeTopic = (topic) => String(topic || '').trim().toLowerCase();

export const createLocalProblemProvider = ({
  records = problems,
  random = Math.random
} = {}) => {
  const catalog = createProblemCatalog(records);

  return {
    async getRandomProblem(topicOrFilter) {
      const filter =
        typeof topicOrFilter === 'object' && topicOrFilter !== null
          ? topicOrFilter
          : { topic: normalizeTopic(topicOrFilter) };
      return catalog.getRandomProblem(filter, random);
    },

    async getBySlug(slug) {
      return catalog.getBySlug(slug);
    },

    async getJudgeProblem(slug) {
      return catalog.getBySlug(slug, { judge: true });
    },

    async listProblems(query) {
      return catalog.listProblems(query);
    },

    async refresh() {
      return { count: catalog.size, changed: false };
    }
  };
};
