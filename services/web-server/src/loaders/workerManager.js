import DataLoader from 'dataloader';
import substringFilter from '../utils/searchFilter.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ workerManager }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const WorkerManagerWorkerPoolSummaries = new ConnectionLoader(async ({ searchTerm, options }) => {
    const [pools, stats] = await Promise.all([
      workerManager.listWorkerPools(options),
      workerManager.listWorkerPoolsStats(options),
    ]);

    const workerPools = substringFilter(searchTerm, 'workerPoolId', pools.workerPools);

    const fullWorkerPools = workerPools.map(wp => {
      const poolStats = stats.workerPoolsStats.find(stat => stat.workerPoolId === wp.workerPoolId) ?? {};

      return {
        ...wp,
        ...poolStats,
      };
    });

    return {
      ...fullWorkerPools,
      items: fullWorkerPools,
    };
  });

  const WorkerPool = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId }) => {
        return await workerManager.workerPool(workerPoolId);
      })
    )
  );

  const WorkerManagerWorker = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId, workerGroup, workerId }) => {
        return await workerManager.worker(workerPoolId, workerGroup, workerId);
      })
    )
  );

  const WorkerManagerErrorsStats = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId }) => {
        return await workerManager.workerPoolErrorStats({ workerPoolId });
      })
    )
  );

  return {
    WorkerManagerWorkerPoolSummaries,
    WorkerManagerErrorsStats,
    WorkerPool,
    WorkerManagerWorker,
  };
};
