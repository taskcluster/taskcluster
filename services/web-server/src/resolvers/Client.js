export default {
  Query: {
    clients(parent, { options, filter }, { loaders }) {
      return loaders.clients.load({ options, filter });
    },
    client(parent, { clientId }, { loaders }) {
      return loaders.client.load(clientId);
    },
  },
};
