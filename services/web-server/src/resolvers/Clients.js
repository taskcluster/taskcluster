export default {
  Query: {
    clients(_parent, { clientOptions, connection, filter }, { loaders }) {
      return loaders.clients.load({ clientOptions, connection, filter });
    },
    client(_parent, { clientId }, { loaders }) {
      return loaders.client.load(clientId);
    },
  },
  Mutation: {
    resetAccessToken(_parent, { clientId }, { clients }) {
      return clients.auth.resetAccessToken(clientId);
    },
    createClient(_parent, { clientId, client }, { clients }) {
      return clients.auth.createClient(clientId, client);
    },
    updateClient(_parent, { clientId, client }, { clients }) {
      return clients.auth.updateClient(clientId, client);
    },
    enableClient(_parent, { clientId }, { clients }) {
      return clients.auth.enableClient(clientId);
    },
    disableClient(_parent, { clientId }, { clients }) {
      return clients.auth.disableClient(clientId);
    },
    async deleteClient(_parent, { clientId }, { clients }) {
      await clients.auth.deleteClient(clientId);

      return clientId;
    },
  },
};
