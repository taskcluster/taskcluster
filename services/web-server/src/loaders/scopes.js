import DataLoader from 'dataloader';
import sift from 'sift';

export default ({ auth }) => {
  const currentScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ filter }) => {
        const { scopes } = await auth.currentScopes();

        return filter ? sift(filter, scopes) : scopes;
      })
    )
  );
  const expandScopes = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ scopes, filter }) => {
        const { scopes: expandedScopes } = await auth.expandScopes({ scopes });

        return filter ? sift(filter, expandedScopes) : expandedScopes;
      })
    )
  );

  return {
    currentScopes,
    expandScopes,
  };
};
