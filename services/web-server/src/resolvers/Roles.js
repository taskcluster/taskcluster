export default {
  Query: {
    roles(_parent, { filter }, { loaders }) {
      return loaders.roles.load({ filter });
    },
    listRoleIds(_parent, { connection, filter }, { loaders }) {
      return loaders.roleIds.load({ filter, connection });
    },
    role(_parent, { roleId }, { loaders }) {
      return loaders.role.load(roleId);
    },
  },
  Mutation: {
    createRole(_parent, { roleId, role }, { clients }) {
      return clients.auth.createRole(roleId, role);
    },
    updateRole(_parent, { roleId, role }, { clients }) {
      return clients.auth.updateRole(roleId, role);
    },
    async deleteRole(_parent, { roleId }, { clients }) {
      await clients.auth.deleteRole(roleId);

      return roleId;
    },
  },
};
