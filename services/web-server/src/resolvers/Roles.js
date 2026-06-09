export default {
  Query: {
    roles(parent, { searchTerm }, { loaders }) {
      return loaders.roles.load({ searchTerm });
    },
    listRoleIds(parent, { connection, searchTerm }, { loaders }) {
      return loaders.roleIds.load({ searchTerm, connection });
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
