const {splitWorkerPoolId} = require('../utils/workerPool');

module.exports = {
  WorkerManagerWorkerPoolSummary: {
    pendingTasks({ workerPoolId }, args, { loaders }) {
      const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);
      return loaders.pendingTasks.load({
        provisionerId,
        workerType,
      });
    },
  },
  Query: {
    WorkerManagerWorkerPoolSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ filter });
    },
    WorkerManagerWorkers(parent, { workerPool, provider, isQuarantined, filter }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPool, provider, isQuarantined, filter });
    },
    WorkerManagerErrors(parent, { workerPoolId, connection, filter }, { loaders }) {
      return loaders.WorkerManagerErrors.load({ workerPoolId, connection, filter });
    },
    WorkerPool(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerManagerProviders(parent, { connection, filter }, { loaders }) {
      return loaders.WorkerManagerProviders.load({ connection, filter });
    },
  },
  Mutation: {
    createWorkerPool(parent, { workerPoolId, payload }, { clients} ) {
      return clients.workerManager.createWorkerPool(workerPoolId, payload);
    },
    updateWorkerPool(parent, { workerPoolId, payload }, { clients} ) {
      return clients.workerManager.updateWorkerPool(workerPoolId, payload);
    },
    async deleteWorkerPool(parent, { workerPoolId }, { clients} ) {
      await clients.workerManager.deleteWorkerPool(workerPoolId);

      return workerPoolId;
    },
  },
};
