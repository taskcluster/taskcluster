import DataLoader from 'dataloader';

export default ({ secrets }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const secret = new DataLoader(names =>
    Promise.all(
      names.map(async name => {
        try {
          const secret = await secrets.get(name);

          return {
            name,
            ...secret,
          };
        } catch (err) {
          return err;
        }
      })
    )
  );

  return {
    secret,
  };
};
