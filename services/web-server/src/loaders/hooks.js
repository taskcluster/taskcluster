import DataLoader from 'dataloader';

export default ({ hooks }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const hookGroups = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ hookGroupId }) => {
        try {
          const { groups } = await hooks.listHookGroups();
          const allGroups = groups.map(group => ({ hookGroupId: group }));

          return hookGroupId ? allGroups.filter(group => group.hookGroupId === hookGroupId) : allGroups;
        } catch (err) {
          return err;
        }
      })
    )
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
      })
    )
  );
  return {
    hookGroups,
    hooks: hooksForGroup,
  };
};
