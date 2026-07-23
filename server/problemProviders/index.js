import { createLocalProblemProvider } from './localProblemProvider.js';
import { assertProblemProvider } from './problemProvider.js';

export { createDatabaseProblemProvider } from './databaseProblemProvider.js';
export { createFilesystemProblemProvider } from './filesystemProblemProvider.js';
export { createGithubProblemProvider } from './githubProblemProvider.js';
export { createLocalProblemProvider } from './localProblemProvider.js';
export {
  assertProblemProvider,
  PROBLEM_PROVIDER_METHODS
} from './problemProvider.js';

export const createProblemProviderRegistry = ({
  providers = {},
  defaultProvider = 'local'
} = {}) => {
  const registry = new Map();

  const register = (name, provider) => {
    const normalizedName = String(name || '').trim().toLowerCase();
    if (!normalizedName) throw new TypeError('Provider name is required');
    registry.set(normalizedName, assertProblemProvider(provider, normalizedName));
    return provider;
  };

  for (const [name, provider] of Object.entries(providers)) register(name, provider);

  return {
    register,
    has(name) {
      return registry.has(String(name || '').trim().toLowerCase());
    },
    get(name = defaultProvider) {
      const normalizedName = String(name || defaultProvider).trim().toLowerCase();
      const provider = registry.get(normalizedName);
      if (!provider) throw new Error(`Unknown problem provider: ${normalizedName}`);
      return provider;
    },
    names() {
      return [...registry.keys()];
    }
  };
};

export const createProblemProvider = (options = undefined) => {
  if (options == null || Object.keys(options).length === 0) {
    return createLocalProblemProvider();
  }
  if (options.provider) return assertProblemProvider(options.provider);

  const local = createLocalProblemProvider(options.local);
  const registry = createProblemProviderRegistry({
    providers: { local, ...(options.providers || {}) },
    defaultProvider: options.defaultProvider || 'local'
  });
  return registry.get();
};
