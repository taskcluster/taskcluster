const DataLoader = require('dataloader');
const sift = require('../utils/sift');

module.exports = ({ auth }) => {
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
