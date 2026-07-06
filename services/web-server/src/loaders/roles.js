import DataLoader from 'dataloader';
import substringFilter from '../utils/searchFilter.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ auth }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const roles = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ searchTerm }) => {
        try {
          const roles = await auth.listRoles();

          return substringFilter(searchTerm, 'roleId', roles);
        } catch (err) {
          return err;
        }
      })
    )
  );
  const roleIds = new ConnectionLoader(async ({ searchTerm, options }) => {
    const raw = await auth.listRoleIds(options);
    const roleIds = raw.roleIds.map(roleId => ({ roleId }));
    const roles = substringFilter(searchTerm, 'roleId', roleIds);

    return {
      ...raw,
      items: roles,
    };
  });
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
    roles,
    roleIds,
    role,
  };
};
