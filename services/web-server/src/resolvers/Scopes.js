export default {
  Query: {
    currentScopes(parent, { filter }, { loaders }) {
      return loaders.currentScopes.load({ filter });
    },
    expandScopes(parent, { scopes, filter }, { loaders }) {
      return loaders.expandScopes.load({ scopes, filter });
    },
  },
};
