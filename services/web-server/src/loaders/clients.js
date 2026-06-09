import DataLoader from 'dataloader';
import substringFilter from '../utils/searchFilter.js';
import ConnectionLoader from '../ConnectionLoader.js';

export default ({ auth }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const clients = new ConnectionLoader(
    async ({ searchTerm, options, clientOptions }) => {
      const raw = await auth.listClients({ ...clientOptions, ...options });
      const clients = substringFilter(searchTerm, 'clientId', raw.clients);

      return {
        ...raw,
        items: clients,
      };
    },
  );
  const client = new DataLoader(clientIds =>
    Promise.all(
      clientIds.map(async (clientId) => {
        try {
          return await auth.client(clientId);
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    clients,
    client,
  };
};
