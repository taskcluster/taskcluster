const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');
const ConnectionLoader = require('../ConnectionLoader');

module.exports = ({ auth }) => {
  const clients = new ConnectionLoader(
    async ({ filter, options, clientOptions }) => {
      const raw = await auth.listClients({ ...clientOptions, ...options });
      const clients = siftUtil(filter, raw.clients);

      return {
        ...raw,
        items: clients,
      };
    }
  );
  const client = new DataLoader(clientIds =>
    Promise.all(clientIds.map(clientId => auth.client(clientId)))
  );

  return {
    clients,
    client,
  };
};
