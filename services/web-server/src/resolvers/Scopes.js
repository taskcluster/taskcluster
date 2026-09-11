export default {
  Query: {
    expandScopes(_parent, { scopes }, { loaders }) {
      return loaders.expandScopes.load({ scopes });
    },
  },
};
