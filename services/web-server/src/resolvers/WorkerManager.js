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
    WorkerManagerWorkerPoolSummaries(_parent, { connection, searchTerm }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ connection, searchTerm });
    },
    WorkerManagerErrorsStats(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerManagerErrorsStats.load({ workerPoolId });
    },
    WorkerPool(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerManagerWorker(_parent, { workerPoolId, workerGroup, workerId }, { loaders }) {
      return loaders.WorkerManagerWorker.load({ workerPoolId, workerGroup, workerId });
    },
  },
};
