import DataLoader from 'dataloader';
import sift from 'sift';

export default ({ auth }) => {
  const clients = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ options, filter }) => {
        const clients = options
          ? await auth.listClients(options)
          : await auth.listClients();

        return filter ? sift(filter, clients) : clients;
      })
    )
  );
  const client = new DataLoader(clientIds =>
    Promise.all(clientIds.map(clientId => auth.client(clientId)))
  );

  return {
    clients,
    client,
  };
};
