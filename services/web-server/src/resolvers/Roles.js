export default {
  Query: {
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
