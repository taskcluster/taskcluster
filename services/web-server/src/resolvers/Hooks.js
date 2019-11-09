module.exports = {
  LastFire: {
    __resolveType(obj) {
      if (obj.taskId) {
        return 'HookSuccessfulFire';
      }

      if (obj.error) {
        return 'HookFailedFire';
      }

      return 'NoFire';
    },
  },
  HookFireResult: {
    SUCCESS: 'success',
    ERROR: 'error',
    NO_FIRE: 'no-fire',
  },
  HookFiredBy: {
    SCHEDULE: 'schedule',
    TRIGGER_HOOK: 'triggerHook',
    TRIGGER_HOOK_WITH_TOKEN: 'triggerHookWithToken',
    PULSE_MESSAGE: 'pulseMessage',
  },
  Hook: {
    status({ hookGroupId, hookId }, args, { loaders }) {
      return loaders.hookStatus.load({ hookGroupId, hookId });
    },
  },
  HookGroup: {
    hooks({ hookGroupId }, { filter }, { loaders }) {
      return loaders.hooks.load({ hookGroupId, filter });
    },
  },
  Query: {
    hookGroups(parent, { filter }, { loaders }) {
      return loaders.hookGroups.load({ filter });
    },
    hooks(parent, { hookGroupId, filter }, { loaders }) {
      return loaders.hooks.load({ hookGroupId, filter });
    },
    hook(parent, { hookGroupId, hookId }, { loaders }) {
      return loaders.hook.load({ hookGroupId, hookId });
    },
    hookStatus(parent, { hookGroupId, hookId }, { loaders }) {
      return loaders.hookStatus.load({ hookGroupId, hookId });
    },
    hookLastFires(parent, { hookGroupId, hookId, filter }, { loaders }) {
      return loaders.hookLastFires.load({ hookGroupId, hookId, filter });
    },
  },
  Mutation: {
    async triggerHook(parent, { hookGroupId, hookId, payload }, { clients }) {
      const { status } = await clients.hooks.triggerHook(
        hookGroupId,
        hookId,
        payload,
      );

      return status;
    },
    createHook(parent, { hookGroupId, hookId, payload }, { clients }) {
      return clients.hooks.createHook(hookGroupId, hookId, payload);
    },
    updateHook(parent, { hookGroupId, hookId, payload }, { clients }) {
      return clients.hooks.updateHook(hookGroupId, hookId, payload);
    },
    async deleteHook(parent, { hookGroupId, hookId }, { clients }) {
      await clients.hooks.removeHook(hookGroupId, hookId);

      return { hookGroupId, hookId };
    },
  },
};
