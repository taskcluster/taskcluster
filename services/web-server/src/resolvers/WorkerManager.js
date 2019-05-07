module.exports = {
  Query: {
    WorkerManagerWorkerTypeSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerTypeSummaries.load({ filter });
    },
    WorkerManagerWorkers(parent, { provisionerId, workerType, isQuarantined, filter }, { loaders }) {
      return loaders.WorkerManagerWorkers.load({ provisionerId, workerType, isQuarantined, filter });
    },
  },
};
