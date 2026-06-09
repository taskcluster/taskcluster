export default {
  Query: {
    currentScopes(parent, args, { loaders }) {
      return loaders.currentScopes.load({});
    },
    expandScopes(parent, { scopes }, { loaders }) {
      return loaders.expandScopes.load({ scopes });
    },
  },
};
