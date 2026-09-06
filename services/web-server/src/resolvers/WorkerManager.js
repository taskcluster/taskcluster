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
    WorkerPool(_parent, { workerPoolId }, { loaders }) {
      return loaders.WorkerPool.load({ workerPoolId });
    },
    WorkerManagerWorker(_parent, { workerPoolId, workerGroup, workerId }, { loaders }) {
      return loaders.WorkerManagerWorker.load({ workerPoolId, workerGroup, workerId });
    },
  },
};
