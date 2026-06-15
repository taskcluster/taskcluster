import DataLoader from 'dataloader';

export default ({ auth }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const currentScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async () => {
        try {
          const { scopes } = await auth.currentScopes();

          return scopes;
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const expandScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ scopes }) => {
        try {
          const { scopes: expandedScopes } = await auth.expandScopes({ scopes });

          return expandedScopes;
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    currentScopes,
    expandScopes,
  };
};
