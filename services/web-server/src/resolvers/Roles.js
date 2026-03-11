export default {
  Query: {
    roles(parent, { filter }, { loaders }) {
      return loaders.roles.load({ filter });
    },
    listRoleIds(parent, { connection, filter }, { loaders }) {
      return loaders.roleIds.load({ filter, connection });
    },
    role(parent, { roleId }, { loaders }) {
      return loaders.role.load(roleId);
    },
  },
  Mutation: {
    createRole(parent, { roleId, role }, { clients }) {
      return clients.auth.createRole(roleId, role);
    },
    updateRole(parent, { roleId, role }, { clients }) {
      return clients.auth.updateRole(roleId, role);
    },
    async deleteRole(parent, { roleId }, { clients }) {
      await clients.auth.deleteRole(roleId);

      return roleId;
    },
  },
};
