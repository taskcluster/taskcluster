export default {
  Query: {
    secrets(parent, { connection, filter }, { loaders }) {
      return loaders.secrets.load({ connection, filter });
    },
    secret(parent, { name }, { loaders }) {
      return loaders.secret.load(name);
    },
  },
};
