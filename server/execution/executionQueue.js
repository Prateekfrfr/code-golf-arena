export const createExecutionQueue = ({ concurrency = 2 } = {}) => {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('Execution queue concurrency must be a positive integer.');
  }

  let active = 0;
  const pending = [];

  const drain = () => {
    while (active < concurrency && pending.length > 0) {
      const task = pending.shift();
      active += 1;

      Promise.resolve()
        .then(task.operation)
        .then(task.resolve, task.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  };

  const run = (operation) => {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('Queue operation must be a function.'));
    }

    return new Promise((resolve, reject) => {
      pending.push({ operation, resolve, reject });
      drain();
    });
  };

  return {
    run,
    getStats: () => ({
      active,
      queued: pending.length,
      concurrency
    })
  };
};
