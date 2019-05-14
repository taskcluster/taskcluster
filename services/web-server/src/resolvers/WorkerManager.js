module.exports = {
  Query: {
    WorkerManagerWorkerTypeSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerTypeSummaries.load({ filter });
    },
    WorkerManagerWorkers(parent, { workerType, provider, isQuarantined, filter }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ workerType, provider, isQuarantined, filter });
    },
  },
};
