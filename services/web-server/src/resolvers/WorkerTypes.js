export default {
  Query: {
    workerTypes(parent, { provisionerId, connection, filter }, { loaders }) {
      return loaders.workerTypes.load({ provisionerId, connection, filter });
    },
  },
};
