export default {
  Query: {
    cachePurges(parent, { connection, filter }, { loaders }) {
      return loaders.cachePurges.load({ connection, filter });
    },
  },
};
