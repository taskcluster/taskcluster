const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ hooks }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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

  const hookLastFires = new ConnectionLoader(
    async ({ hookGroupId, hookId, filter, options }) => {
      try {
        const raw = await hooks.listLastFires(hookGroupId, hookId, options);

        return {
          ...raw,
          items: raw.lastFires,
        };
      } catch (err) {
        if (err.statusCode === 404) {
          // hooks last fires will return 404 when there are no last fires yet
          return { items: [] };
        } else if (err.statusCode === 424) {
          return null;
        }

        return err;
      }
    });

  return {
    hookGroups,
    hooks: hooksForGroup,
    hook,
    hookStatus,
    hookLastFires,
  };
};
