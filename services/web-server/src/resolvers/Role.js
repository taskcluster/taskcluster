export default {
  Query: {
    roles(parent, { filter }, { loaders }) {
      return loaders.roles.load({ filter });
    },
    role(parent, { roleId }, { loaders }) {
      return loaders.role.load(roleId);
    },
  },
};
