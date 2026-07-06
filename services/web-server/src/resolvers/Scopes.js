export default {
  Query: {
    currentScopes(_parent, _args, { loaders }) {
      return loaders.currentScopes.load({});
    },
    expandScopes(_parent, { scopes }, { loaders }) {
      return loaders.expandScopes.load({ scopes });
    },
  },
};
