export default {
  Query: {
    roles(_parent, { searchTerm }, { loaders }) {
      return loaders.roles.load({ searchTerm });
    },
    listRoleIds(_parent, { connection, searchTerm }, { loaders }) {
      return loaders.roleIds.load({ searchTerm, connection });
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
