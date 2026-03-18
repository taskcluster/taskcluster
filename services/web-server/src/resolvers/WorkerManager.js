import { splitWorkerPoolId } from '../utils/workerPool.js';

export default {
  WorkerManagerWorkerPoolSummary: {
    pendingTasks({ workerPoolId }, _args, { loaders }) {
      const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);
      return loaders.pendingTasks.load({
        provisionerId,
        workerType,
      });
    },
  },
  Query: {
    WorkerManagerWorkerPoolSummaries(_parent, { connection, filter }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ connection, filter });
    },
    WorkerManagerErrors(_parent, { workerPoolId, launchConfigId, connection, filter }, { loaders }) {
      return loaders.WorkerManagerErrors.load({ workerPoolId, launchConfigId, connection, filter });
    },
    WorkerManagerErrorsStats(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerManagerErrorsStats.load({ workerPoolId });
    },
    WorkerPool(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerPoolLaunchConfigs(_parent, { workerPoolId, includeArchived, connection }, { loaders }) {
      return loaders.WorkerPoolLaunchConfigs.load({ workerPoolId, includeArchived, connection });
    },
    WorkerManagerWorker(_parent, { workerPoolId, workerGroup, workerId }, { loaders }) {
      return loaders.WorkerManagerWorker.load({ workerPoolId, workerGroup, workerId });
    },
    WorkerManagerWorkers(_parent, { workerPoolId, launchConfigId, state, connection }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPoolId, launchConfigId, state, connection });
    },
    WorkerManagerProviders(_parent, { connection, filter }, { loaders }) {
      return loaders.WorkerManagerProviders.load({ connection, filter });
    },
    WorkerPoolStats(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPoolStats.load({ workerPoolId });
    },
  },
  Mutation: {
    createWorkerPool(_parent, { workerPoolId, payload }, { clients }) {
      return clients.workerManager.createWorkerPool(workerPoolId, payload);
    },
    updateWorkerPool(_parent, { workerPoolId, payload }, { clients }) {
      return clients.workerManager.updateWorkerPool(workerPoolId, payload);
    },
    async deleteWorkerPool(_parent, { workerPoolId }, { clients }) {
      await clients.workerManager.deleteWorkerPool(workerPoolId);

      return workerPoolId;
    },
  },
};
