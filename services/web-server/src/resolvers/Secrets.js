export default {
  Query: {
    secrets(parent, { connection, searchTerm }, { loaders }) {
      return loaders.secrets.load({ connection, searchTerm });
    },
    secret(parent, { name }, { loaders }) {
      return loaders.secret.load(name);
    },
  },
  Mutation: {
    async createSecret(parent, { name, secret }, { clients }) {
      await clients.secrets.set(name, secret);

      return secret;
    },
    async updateSecret(parent, { name, secret }, { clients }) {
      await clients.secrets.set(name, secret);

      return secret;
    },
    async deleteSecret(parent, { name }, { clients }) {
      await clients.secrets.remove(name);

      return name;
    },
  },
};
