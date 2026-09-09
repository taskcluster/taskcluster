export default {
  HookGroup: {
    hooks({ hookGroupId }, _args, { loaders }) {
      return loaders.hooks.load({ hookGroupId });
    },
  },
  Query: {
    hookGroups(_parent, { hookGroupId }, { loaders }) {
      return loaders.hookGroups.load({ hookGroupId });
    },
  },
  Mutation: {
    async triggerHook(_parent, { hookGroupId, hookId, payload }, { clients }) {
      const { status } = await clients.hooks.triggerHook(hookGroupId, hookId, payload);

      return status;
    },
  },
};
