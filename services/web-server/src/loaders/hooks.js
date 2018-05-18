import DataLoader from 'dataloader';
import sift from 'sift';

export default ({ hooks }) => {
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

  return {
    hookGroups,
    hooks: hooksForGroup,
    hook,
    hookStatus,
  };
};
