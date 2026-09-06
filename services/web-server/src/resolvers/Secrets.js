export default {
  Query: {
    secret(_parent, { name }, { loaders }) {
      return loaders.secret.load(name);
    },
  },
  Mutation: {
    async createSecret(_parent, { name, secret }, { clients }) {
      await clients.secrets.set(name, secret);

      return secret;
    },
    async updateSecret(_parent, { name, secret }, { clients }) {
      await clients.secrets.set(name, secret);

      return secret;
    },
    async deleteSecret(_parent, { name }, { clients }) {
      await clients.secrets.remove(name);

      return name;
    },
  },
};
