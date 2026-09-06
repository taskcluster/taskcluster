import DataLoader from 'dataloader';

export default ({ auth }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const client = new DataLoader(clientIds =>
    Promise.all(
      clientIds.map(async clientId => {
        try {
          return await auth.client(clientId);
        } catch (err) {
          return err;
        }
      })
    )
  );

  return {
    client,
  };
};
