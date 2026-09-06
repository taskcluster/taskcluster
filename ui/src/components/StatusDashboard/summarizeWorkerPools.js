import format from './format';

export default (workerPools, metrics) => {
  let totalPools = 0;
  let poolsWithWorkers = 0;
  let pendingTasks = 0;
  let stoppedCount = 0;
  let runningCount = 0;
  let requestedCapacity = 0;
  let runningCapacity = 0;
  let stoppingCapacity = 0;
  const providers = new Set();

  // `data` is a list of worker pools from `workerManager.listWorkerPools`,
  // each merged with its `listWorkerPoolsStats` entry and a `pendingTasks`
  // count. A pool with no stats entry yet contributes zero to every total.
  if (!workerPools.error && !workerPools.loading) {
    (workerPools?.data || []).forEach(pool => {
      if (!pool) {
        return;
      }

      providers.add(pool.providerId);
      totalPools += 1;

      if (pool.currentCapacity > 0) {
        poolsWithWorkers += 1;
      }

      pendingTasks += pool.pendingTasks || 0;
      runningCount += pool.runningCount || 0;
      requestedCapacity += pool.requestedCapacity || 0;
      runningCapacity += pool.runningCapacity || 0;
      stoppedCount += pool.stoppedCount || 0;
      stoppingCapacity += pool.stoppingCapacity || 0;
    });
  }

  const link = '/worker-manager';

  return [
    {
      title: 'Providers',
      value: format(providers.size),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      metrics: 'stats',
    },
    {
      title: 'Total Pools',
      value: format(totalPools),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      metrics: 'stats',
    },
    {
      title: 'Total Pools with Workers',
      value: format(poolsWithWorkers),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      metrics: 'stats',
    },
    {
      title: 'Workers Running',
      value: format(runningCount),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      metrics: 'stats',
    },
    {
      title: 'Stopped Workers',
      value: format(stoppedCount),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      metrics: 'stats',
    },
    {
      title: 'Pending Tasks',
      value: format(pendingTasks),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
      metrics: 'provisioning',
    },
    {
      title: 'Requested Capacity',
      value: format(requestedCapacity),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
      metrics: 'provisioning',
    },
    {
      title: 'Running Capacity',
      value: format(runningCapacity),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
      metrics: 'provisioning',
    },
    {
      title: 'Stopping Capacity',
      value: format(stoppingCapacity),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
      metrics: 'provisioning',
    },
  ].filter(item => !metrics || item.metrics === metrics);
};
