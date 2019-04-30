const DataLoader = require('dataloader');

module.exports = ({ github }) => {
  const githubRepository = new DataLoader(queries =>
    Promise.all(
      queries.map(({ owner, repo }) => github.repository(owner, repo))
    )
  );

  return {
    githubRepository,
  };
};
