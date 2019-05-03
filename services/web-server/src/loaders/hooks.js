const DataLoader = require('dataloader');
const sift = require('sift').default;

module.exports = ({ hooks }) => {
  const hookGroups = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const { groups } = await hooks.listHookGroups();
        const raw = groups.map(hookGroupId => ({ hookGroupId }));

        return filter ? sift(filter, raw) : raw;
      })
    )
  );
  const hooksForGroup = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, filter }) => {
        const { hooks: hooksForGroup } = await hooks.listHooks(hookGroupId);

        return filter ? sift(filter, hooksForGroup) : hooksForGroup;
      })
    )
  );
  const hook = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, hookId }) =>
        hooks.hook(hookGroupId, hookId)
      )
    )
  );
  const hookStatus = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, hookId }) =>
        hooks.getHookStatus(hookGroupId, hookId)
      )
    )
  );

  const hookLastFires = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({hookGroupId, hookId, filter}) => {
        try {
          const { lastFires } = await hooks.listLastFires(hookGroupId, hookId);

          return filter ? sift(filter, lastFires) : lastFires;
        } catch(e) {
          if (e.statusCode === 404 || e.statusCode === 424) {
            return null;
          }

          return e;
        }
      }
      )
    )
  );

  return {
    hookGroups,
    hooks: hooksForGroup,
    hook,
    hookStatus,
    hookLastFires,
  };
};
