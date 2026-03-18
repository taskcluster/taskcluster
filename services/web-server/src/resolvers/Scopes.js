export default {
  Query: {
    currentScopes(_parent, { filter }, { loaders }) {
      return loaders.currentScopes.load({ filter });
    },
    expandScopes(_parent, { scopes, filter }, { loaders }) {
      return loaders.expandScopes.load({ scopes, filter });
    },
  },
};
