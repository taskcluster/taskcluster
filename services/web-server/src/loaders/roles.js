import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ auth }) => {
  const roles = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const roles = await auth.listRoles();

        return filter ? sift(filter, roles) : roles;
      })
    )
  );
  const roleIds = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await auth.listRoleIds(options);
    const roleIds = raw.roleIds.map(roleId => ({ roleId }));
    const roles = filter ? sift(filter, roleIds) : roleIds;

    return {
      ...raw,
      items: roles,
    };
  });
  const role = new DataLoader(roleIds =>
    Promise.all(roleIds.map(roleId => auth.role(roleId)))
  );

  return {
    roles,
    roleIds,
    role,
  };
};
