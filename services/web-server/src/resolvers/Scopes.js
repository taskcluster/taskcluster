export default {
  Query: {
    currentScopes(parent, { filter }, { loaders }) {
      return loaders.currentScopes.load({ filter });
    },
  },
};
