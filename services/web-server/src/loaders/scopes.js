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

  return {
    currentScopes,
  };
};
