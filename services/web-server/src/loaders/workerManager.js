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

  const WorkerPoolLaunchConfigs = new ConnectionLoader(async ({ workerPoolId, includeArchived, options }) => {
    if (includeArchived) {
      options.includeArchived = 'true';
    }
    const raw = await workerManager.listWorkerPoolLaunchConfigs(workerPoolId, options);

    return {
      ...raw,
      items: raw.workerPoolLaunchConfigs,
    };
  });

  const WorkerPoolStats = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId }) => {
        return await workerManager.workerPoolStats(workerPoolId);
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

  const WorkerManagerWorkers = new ConnectionLoader(async ({ workerPoolId, state, launchConfigId, options }) => {
    if (state) {
      options.state = state;
    }
    if (launchConfigId) {
      options.launchConfigId = launchConfigId;
    }
    const raw = await workerManager.listWorkersForWorkerPool(workerPoolId, options);

    return {
      ...raw,
      items: raw.workers,
    };
  });

  const WorkerManagerErrors = new ConnectionLoader(async ({ workerPoolId, launchConfigId, options }) => {
    if (launchConfigId) {
      options.launchConfigId = launchConfigId;
    }
    const raw = await workerManager.listWorkerPoolErrors(workerPoolId, options);
    const errors = raw.workerPoolErrors;

    return {
      ...raw,
      items: errors,
    };
  });

  const WorkerManagerErrorsStats = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ workerPoolId }) => {
        return await workerManager.workerPoolErrorStats({ workerPoolId });
      })
    )
  );

  const WorkerManagerProviders = new ConnectionLoader(async ({ options }) => {
    const raw = await workerManager.listProviders(options);
    const providers = raw.providers;

    return {
      ...raw,
      items: providers,
    };
  });

  return {
    WorkerManagerWorkerPoolSummaries,
    WorkerManagerErrors,
    WorkerManagerErrorsStats,
    WorkerPool,
    WorkerPoolLaunchConfigs,
    WorkerManagerProviders,
    WorkerManagerWorkers,
    WorkerManagerWorker,
    WorkerPoolStats,
  };
};
