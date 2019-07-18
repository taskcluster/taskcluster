const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ auth }) => {
  const roles = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const roles = await auth.listRoles();

        return siftUtil(filter, roles);
      })
    )
  );
  const roleIds = new ConnectionLoader(async ({ filter, options }) => {
    const raw = await auth.listRoleIds(options);
    const roleIds = raw.roleIds.map(roleId => ({ roleId }));
    const roles = siftUtil(filter, roleIds);

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
