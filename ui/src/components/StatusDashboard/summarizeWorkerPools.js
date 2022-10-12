import format from './format';

export default workerPools => {
  let totalPools = 0;
  let poolsWithWorkers = 0;
  let pendingTasks = 0;
  let requestedCount = 0;
  let stoppedCount = 0;
  let runningCount = 0;
  let requestedCapacity = 0;
  let runningCapacity = 0;
  const providers = new Set();

  if (!workerPools.error && !workerPools.loading) {
    (workerPools?.data?.WorkerManagerWorkerPoolSummaries?.edges || []).forEach(
      ({ node }) => {
        if (!node) {
          return;
        }

        providers.add(node.providerId);
        totalPools += 1;

        if (node.currentCapacity > 0) {
          poolsWithWorkers += 1;
        }

        pendingTasks += node.pendingTasks;
        runningCount += node.runningCount;
        requestedCount += node.requestedCount;
        requestedCapacity += node.requestedCapacity;
        runningCapacity += node.runningCapacity;
        stoppedCount += node.stoppedCount;
      }
    );
  }

  const link = '/worker-manager';

  return [
    {
      title: 'Providers',
      value: format(providers.size),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Total Pools',
      value: format(totalPools),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Total Pools with Workers',
      value: format(poolsWithWorkers),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Workers Running',
      value: format(runningCount),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Workers Requested',
      value: format(requestedCount),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Stopped Workers',
      value: format(stoppedCount),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Pending Tasks',
      value: format(pendingTasks),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
    },
    {
      title: 'Running Capacity',
      value: format(runningCapacity),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
    },
    {
      title: 'Requested Capacity',
      value: format(requestedCapacity),
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
      altColor: true,
    },
  ];
};
