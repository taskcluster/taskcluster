import DataLoader from 'dataloader';

export default ({ github }) => {
  const githubRepository = new DataLoader(queries =>
    Promise.all(
      queries.map(({ owner, repo }) => github.repository(owner, repo))
    )
  );

  return {
    githubRepository,
  };
};
