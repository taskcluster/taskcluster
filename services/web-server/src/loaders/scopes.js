const DataLoader = require('dataloader');
const sift = require('../utils/sift');

module.exports = ({ auth }) => {
  const currentScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const { scopes } = await auth.currentScopes();

        return sift(filter, scopes);
      }),
    ),
  );
  const expandScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ scopes, filter }) => {
        const { scopes: expandedScopes } = await auth.expandScopes({ scopes });

        return sift(filter, expandedScopes);
      }),
    ),
  );

  return {
    currentScopes,
    expandScopes,
  };
};
