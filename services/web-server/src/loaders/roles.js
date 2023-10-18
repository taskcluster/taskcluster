import DataLoader from 'dataloader';
import sift from '../utils/sift.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ auth }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const roles = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        try {
          const roles = await auth.listRoles();

          return sift(filter, roles);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const roleIds = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await auth.listRoleIds(options);
    const roleIds = raw.roleIds.map(roleId => ({ roleId }));
    const roles = sift(filter, roleIds);

    return {
      ...raw,
      items: roles,
    };
  });
  const role = new DataLoader(roleIds =>
    Promise.all(
      roleIds.map(async (roleId) => {
        try {
          return await auth.role(roleId);
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    roles,
    roleIds,
    role,
  };
};
