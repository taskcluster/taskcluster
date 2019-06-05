module.exports = {
  Query: {
    WorkerManagerWorkerPoolSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerPoolSummaries.load({ filter });
    },
    WorkerManagerWorkers(parent, { workerPool, provider, isQuarantined, filter }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerPool, provider, isQuarantined, filter });
    },
  },
};
