export default {
  Query: {
    WMWorkerTypeSummaries(parent, { filter }, { loaders }) {
      return loaders.WMWorkerTypeSummaries.load({ filter });
    },
  },
};
