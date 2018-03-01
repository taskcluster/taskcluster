export default {
  LastFire: {
    __resolveType(obj) {
      if (obj.taskId) {
        return 'HookSuccessfulFire';
      } else if (obj.error) {
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
  Hook: {
    status({ hookGroupId, hookId }, args, { loaders }) {
      return loaders.hookStatus.load({ hookGroupId, hookId });
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
  },
};
