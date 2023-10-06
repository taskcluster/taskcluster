import DataLoader from 'dataloader';
import sift from '../utils/sift';
import ConnectionLoader from '../ConnectionLoader';

export default ({ auth }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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
