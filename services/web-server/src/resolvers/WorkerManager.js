module.exports = {
  Query: {
    WorkerManagerWorkerTypeSummaries(parent, { filter }, { loaders }) {
      return loaders.WorkerManagerWorkerTypeSummaries.load({ filter });
    },
  },
};
