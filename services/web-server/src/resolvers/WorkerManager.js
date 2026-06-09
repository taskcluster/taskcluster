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
    WorkerManagerWorkerPoolSummaries(parent, { connection, searchTerm }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ connection, searchTerm });
    },
    WorkerManagerErrors(parent, { workerPoolId, launchConfigId, connection }, { loaders }) {
      return loaders.WorkerManagerErrors.load({ workerPoolId, launchConfigId, connection });
    },
    WorkerManagerErrorsStats(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerManagerErrorsStats.load({ workerPoolId });
    },
    WorkerPool(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerPoolLaunchConfigs(parent, { workerPoolId, includeArchived, connection }, { loaders }) {
      return loaders.WorkerPoolLaunchConfigs.load({ workerPoolId, includeArchived, connection });
    },
    WorkerManagerWorker(parent, { workerPoolId, workerGroup, workerId }, { loaders }) {
      return loaders.WorkerManagerWorker.load({ workerPoolId, workerGroup, workerId });
    },
    WorkerManagerWorkers(parent, { workerPoolId, launchConfigId, state, connection }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPoolId, launchConfigId, state, connection });
    },
    WorkerManagerProviders(parent, { connection }, { loaders }) {
      return loaders.WorkerManagerProviders.load({ connection });
    },
    WorkerPoolStats(parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPoolStats.load({ workerPoolId });
    },
  },
  Mutation: {
    createWorkerPool(parent, { workerPoolId, payload }, { clients }) {
      return clients.workerManager.createWorkerPool(workerPoolId, payload);
    },
    updateWorkerPool(parent, { workerPoolId, payload }, { clients }) {
      return clients.workerManager.updateWorkerPool(workerPoolId, payload);
    },
    async deleteWorkerPool(parent, { workerPoolId }, { clients }) {
      await clients.workerManager.deleteWorkerPool(workerPoolId);

      return workerPoolId;
    },
  },
};
