export default {
  WorkerTypeStability: {
    EXPERIMENTAL: 'experimental',
    STABLE: 'stable',
    DEPRECATED: 'deprecated',
  },
  WorkerType: {
    workers(
      { provisionerId, workerType },
      { connection, filter },
      { loaders }
    ) {
      return loaders.workers.load({
        provisionerId,
        workerType,
        connection,
        filter,
      });
    },
    worker(
      { provisionerId, workerType },
      { workerGroup, workerId },
      { loaders }
    ) {
      return loaders.worker.load({
        provisionerId,
        workerType,
        workerGroup,
        workerId,
      });
    },
    pendingTasks({ provisionerId, workerType }, args, { loaders }) {
      return loaders.pendingTasks.load({ provisionerId, workerType });
    },
  },
  Query: {
    workerType(parent, { provisionerId, workerType }, { loaders }) {
      return loaders.workerType.load({ provisionerId, workerType });
    },
    pendingTasks(parent, { provisionerId, workerType }, { loaders }) {
      return loaders.pendingTasks.load({ provisionerId, workerType });
    },
    workerTypes(parent, { provisionerId, connection, filter }, { loaders }) {
      return loaders.workerTypes.load({ provisionerId, connection, filter });
    },
  },
};
