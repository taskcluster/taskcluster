const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ auth }) => {
  const clients = new ConnectionLoader(
    async ({ filter, options, clientOptions }) => {
      const raw = await auth.listClients({ ...clientOptions, ...options });
      const clients = sift(filter, raw.clients);

      return {
        ...raw,
        items: clients,
      };
    },
  );
  const client = new DataLoader(clientIds =>
    Promise.all(clientIds.map(clientId => auth.client(clientId))),
  );

  return {
    clients,
    client,
  };
};
