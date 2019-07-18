const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');

module.exports = ({ hooks }) => {
  const hookGroups = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const { groups } = await hooks.listHookGroups();
        const raw = groups.map(hookGroupId => ({ hookGroupId }));

        return siftUtil(filter, raw);
      })
    )
  );
  const hooksForGroup = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, filter }) => {
        const { hooks: hooksForGroup } = await hooks.listHooks(hookGroupId);

        return siftUtil(filter, hooksForGroup);
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

          return siftUtil(filter, lastFires);
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
