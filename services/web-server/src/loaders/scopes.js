import DataLoader from 'dataloader';
import sift from '../utils/sift.js';

export default ({ auth }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const currentScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        try {
          const { scopes } = await auth.currentScopes();

          return sift(filter, scopes);
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const expandScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ scopes, filter }) => {
        try {
          const { scopes: expandedScopes } = await auth.expandScopes({ scopes });

          return sift(filter, expandedScopes);
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
