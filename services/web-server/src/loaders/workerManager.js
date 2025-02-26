import DataLoader from 'dataloader';
import sift from '../utils/sift.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ workerManager }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const WorkerManagerWorkerPoolSummaries = new ConnectionLoader(
    async ({ filter, options }) => {
      const [pools, stats] = await Promise.all([
        workerManager.listWorkerPools(options),
        workerManager.listWorkerPoolsStats(options),
      ]);

      const workerPools = sift(filter, pools.workerPools);

      const fullWorkerPools = workerPools.map((wp) => {
        const poolStats = stats.workerPoolsStats.find((stat) => stat.workerPoolId === wp.workerPoolId) ?? {};

        return {
          ...wp,
          ...poolStats,
        };
      });

      return {
        ...fullWorkerPools,
        items: fullWorkerPools,
      };
    },
  );

  const WorkerPool = new DataLoader(queries => Promise.all(queries.map(async ({ workerPoolId }) => {
    return await workerManager.workerPool(workerPoolId);
  })));

  const WorkerManagerWorker = new DataLoader(queries => Promise.all(queries.map(
    async ({ workerPoolId, workerGroup, workerId }) => {
      return await workerManager.worker(workerPoolId, workerGroup, workerId);
    })));

  const WorkerManagerWorkers = new ConnectionLoader(
    async ({ workerPoolId, state, options }) => {
      if (state) {
        options.state = state;
      }
      const raw = await workerManager.listWorkersForWorkerPool(workerPoolId, options);

      return {
        ...raw,
        items: raw.workers,
      };
    },
  );

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

  const WorkerManagerErrorsStats = new DataLoader(queries => Promise.all(
    queries.map(async ({ workerPoolId }) => {
      return await workerManager.workerPoolErrorStats({ workerPoolId });
    }),
  ));

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
    WorkerManagerErrorsStats,
    WorkerPool,
    WorkerManagerProviders,
    WorkerManagerWorkers,
    WorkerManagerWorker,
  };
};
