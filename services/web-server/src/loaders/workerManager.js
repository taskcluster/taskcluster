const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ workerManager }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const WorkerManagerWorkerPoolSummaries = new ConnectionLoader(
    async ({ workerPoolId, filter, options }) => {
      const raw = await workerManager.listWorkerPools(options);
      const workerPools = sift(filter, raw.workerPools);

      return {
        ...raw,
        items: workerPools,
      };
    },
  );

  const WorkerPool = new DataLoader(queries => Promise.all(queries.map(async ({ workerPoolId }) => {
    return await workerManager.workerPool(workerPoolId);
  })));

  const WorkerManagerErrors = new ConnectionLoader(
    async ({ workerPoolId, filter, options }) => {
      const raw = await workerManager.listWorkerPoolErrors(workerPoolId, options);
      const errors = sift(filter, raw.workerPoolErrors);

      return {
        ...raw,
        items: errors,
      };
    },
  );

  const WorkerManagerProviders = new ConnectionLoader(
    async ({ filter, options }) => {
      const raw = await workerManager.listProviders(options);
      const providers = sift(filter, raw.providers);

      return {
        ...raw,
        items: providers,
      };
    },
  );

  return {
    WorkerManagerWorkerPoolSummaries,
    WorkerManagerErrors,
    WorkerPool,
    WorkerManagerProviders,
  };
};
