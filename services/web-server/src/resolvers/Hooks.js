export default {
  Mutation: {
    async triggerHook(_parent, { hookGroupId, hookId, payload }, { clients }) {
      const { status } = await clients.hooks.triggerHook(hookGroupId, hookId, payload);

      return status;
    },
  },
};
