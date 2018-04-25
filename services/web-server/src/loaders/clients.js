import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ auth }) => {
  const clients = new ConnectionLoader(
    async ({ filter, options, clientOptions }) => {
      const raw = await auth.listClients({ ...clientOptions, ...options });
      const clients = filter ? sift(filter, raw.clients) : raw.clients;

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
