import DataLoader from 'dataloader';

export default ({ auth }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const role = new DataLoader(roleIds =>
    Promise.all(
      roleIds.map(async roleId => {
        try {
          return await auth.role(roleId);
        } catch (err) {
          return err;
        }
      })
    )
  );

  return {
    role,
  };
};
