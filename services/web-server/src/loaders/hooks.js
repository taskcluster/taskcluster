import DataLoader from 'dataloader';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ hooks }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const hookGroups = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId }) => {
        try {
          const { groups } = await hooks.listHookGroups();
          const allGroups = groups.map(group => ({ hookGroupId: group }));

          return hookGroupId
            ? allGroups.filter(group => group.hookGroupId === hookGroupId)
            : allGroups;
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const hooksForGroup = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId }) => {
        try {
          const { hooks: hooksForGroup } = await hooks.listHooks(hookGroupId);

          return hooksForGroup;
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
    async ({ hookGroupId, hookId, options }) => {
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
