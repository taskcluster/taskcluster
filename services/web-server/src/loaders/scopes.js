const DataLoader = require('dataloader');
const siftUtil = require('../utils/siftUtil');

module.exports = ({ auth }) => {
  const currentScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const { scopes } = await auth.currentScopes();

        return siftUtil(filter, scopes);
      })
    )
  );
  const expandScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ scopes, filter }) => {
        const { scopes: expandedScopes } = await auth.expandScopes({ scopes });

        return siftUtil(filter, expandedScopes);
      })
    )
  );

  return {
    currentScopes,
    expandScopes,
  };
};
