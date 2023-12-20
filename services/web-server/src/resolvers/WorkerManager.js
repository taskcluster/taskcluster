import { splitWorkerPoolId } from '../utils/workerPool.js';

export default {
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
    WorkerManagerWorkerPoolSummaries(parent, { connection, filter }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ connection, filter });
    },
    WorkerManagerErrors(parent, { workerPoolId, connection, filter }, { loaders }) {
      return loaders.WorkerManagerErrors.load({ workerPoolId, connection, filter });
    },
    WorkerManagerErrorsStats(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerManagerErrorsStats.load({ workerPoolId });
    },
    WorkerPool(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerManagerWorkers(parent, { workerPoolId, state, connection }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPoolId, state, connection });
    },
    WorkerManagerProviders(parent, { connection, filter }, { loaders }) {
      return loaders.WorkerManagerProviders.load({ connection, filter });
    },
  },
  Mutation: {
    createWorkerPool(parent, { workerPoolId, payload }, { clients } ) {
      return clients.workerManager.createWorkerPool(workerPoolId, payload);
    },
    updateWorkerPool(parent, { workerPoolId, payload }, { clients } ) {
      return clients.workerManager.updateWorkerPool(workerPoolId, payload);
    },
    async deleteWorkerPool(parent, { workerPoolId }, { clients } ) {
      await clients.workerManager.deleteWorkerPool(workerPoolId);

      return workerPoolId;
    },
  },
};
