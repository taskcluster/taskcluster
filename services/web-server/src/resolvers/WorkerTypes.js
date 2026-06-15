export default {
  WorkerTypeStability: {
    EXPERIMENTAL: 'experimental',
    STABLE: 'stable',
    DEPRECATED: 'deprecated',
  },
  WorkerType: {
    workers(
      { provisionerId, workerType },
      { connection },
      { loaders },
    ) {
      return loaders.workers.load({
        provisionerId,
        workerType,
        connection,
      });
    },
    worker(
      { provisionerId, workerType },
      { workerGroup, workerId },
      { loaders },
    ) {
      return loaders.worker.load({
        provisionerId,
        workerType,
        workerGroup,
        workerId,
      });
    },
    pendingTasks({ provisionerId, workerType }, _args, { loaders }) {
      return loaders.pendingTasks.load({ provisionerId, workerType });
    },
  },
  Query: {
    workerType(_parent, { provisionerId, workerType }, { loaders }) {
      return loaders.workerType.load({ provisionerId, workerType });
    },
    pendingTasks(_parent, { provisionerId, workerType }, { loaders }) {
      return loaders.pendingTasks.load({ provisionerId, workerType });
    },
    workerTypes(_parent, { provisionerId, connection }, { loaders }) {
      return loaders.workerTypes.load({ provisionerId, connection });
    },
  },
};
