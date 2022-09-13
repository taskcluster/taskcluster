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
      title: 'Pools total / with workers',
      value: `${format(totalPools)} / ${format(poolsWithWorkers)}`,
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
    },
    {
      title: 'Workers (running / requested)',
      value: `${format(runningCount)} / ${format(requestedCount)}`,
      link,
      error: workerPools.error?.message,
      loading: workerPools.loading,
    },
    {
      title: 'Capacity (running / requested)',
      value: `${format(runningCapacity)} / ${format(requestedCapacity)}`,
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
  ];
};
