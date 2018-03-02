export default {
  Query: {
    clients(parent, { options, filter }, { loaders }) {
      return loaders.clients.load({ options, filter });
    },
    client(parent, { clientId }, { loaders }) {
      return loaders.client.load(clientId);
    },
  },
  Mutation: {
    resetAccessToken(parent, { clientId }, { clients }) {
      return clients.auth.resetAccessToken(clientId);
    },
    createClient(parent, { clientId, client }, { clients }) {
      return clients.auth.createClient(clientId, client);
    },
    updateClient(parent, { clientId, client }, { clients }) {
      return clients.auth.updateClient(clientId, client);
    },
    enableClient(parent, { clientId }, { clients }) {
      return clients.auth.enableClient(clientId);
    },
    disableClient(parent, { clientId }, { clients }) {
      return clients.auth.disableClient(clientId);
    },
    async deleteClient(parent, { clientId }, { clients }) {
      await clients.auth.deleteClient(clientId);

      return clientId;
    },
  },
};
