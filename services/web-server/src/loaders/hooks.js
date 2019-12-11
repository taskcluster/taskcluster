const DataLoader = require('dataloader');
const sift = require('../utils/sift');

module.exports = ({ hooks }) => {
  const hookGroups = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        try {
          const { groups } = await hooks.listHookGroups();
          const raw = groups.map(hookGroupId => ({ hookGroupId }));

          return sift(filter, raw);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const hooksForGroup = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, filter }) => {
        try {
          const { hooks: hooksForGroup } = await hooks.listHooks(hookGroupId);

          return sift(filter, hooksForGroup);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const hook = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, hookId }) => {
        try {
          return await hooks.hook(hookGroupId, hookId);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const hookStatus = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId, hookId }) => {
        try {
          return await hooks.getHookStatus(hookGroupId, hookId);
        } catch (err) {
          return err;
        }
      },
      ),
    ),
  );

  const hookLastFires = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({hookGroupId, hookId, filter}) => {
        try {
          const { lastFires } = await hooks.listLastFires(hookGroupId, hookId);

          return sift(filter, lastFires);
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 424) {
            return null;
          }

          return err;
        }
      },
      ),
    ),
  );

  return {
    hookGroups,
    hooks: hooksForGroup,
    hook,
    hookStatus,
    hookLastFires,
  };
};
