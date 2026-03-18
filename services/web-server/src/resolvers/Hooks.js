export default {
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
  HookTaskState: {
    UNSCHEDULED: 'unscheduled',
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    EXCEPTION: 'exception',
    UNKNOWN: 'unknown', // task not found
  },
  Hook: {
    status({ hookGroupId, hookId }, _args, { loaders }) {
      // this is deprecated
      return loaders.hookStatus.load({ hookGroupId, hookId });
    },
    lastFire({ hookGroupId, hookId }, _args, { loaders }) {
      return loaders.hookLastFires.load({
        hookGroupId, hookId, connection: { limit: 1 },
      }).then(({ lastFires }) => lastFires?.[0]);
    },
  },
  HookGroup: {
    hooks({ hookGroupId }, { filter }, { loaders }) {
      return loaders.hooks.load({ hookGroupId, filter });
    },
  },
  Query: {
    hookGroups(_parent, { filter }, { loaders }) {
      return loaders.hookGroups.load({ filter });
    },
    hooks(_parent, { hookGroupId, filter }, { loaders }) {
      return loaders.hooks.load({ hookGroupId, filter });
    },
    hook(_parent, { hookGroupId, hookId }, { loaders }) {
      return loaders.hook.load({ hookGroupId, hookId });
    },
    hookStatus(_parent, { hookGroupId, hookId }, { loaders }) {
      return loaders.hookStatus.load({ hookGroupId, hookId });
    },
    hookLastFires(_parent, { hookGroupId, hookId, filter, connection, options }, { loaders }) {
      return loaders.hookLastFires.load({ hookGroupId, hookId, filter, connection, options });
    },
  },
  Mutation: {
    async triggerHook(_parent, { hookGroupId, hookId, payload }, { clients }) {
      const { status } = await clients.hooks.triggerHook(
        hookGroupId,
        hookId,
        payload,
      );

      return status;
    },
    createHook(_parent, { hookGroupId, hookId, payload }, { clients }) {
      return clients.hooks.createHook(hookGroupId, hookId, payload);
    },
    updateHook(_parent, { hookGroupId, hookId, payload }, { clients }) {
      return clients.hooks.updateHook(hookGroupId, hookId, payload);
    },
    async deleteHook(_parent, { hookGroupId, hookId }, { clients }) {
      await clients.hooks.removeHook(hookGroupId, hookId);

      return { hookGroupId, hookId };
    },
  },
};
