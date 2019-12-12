const DataLoader = require('dataloader');

module.exports = ({ github }) => {
  const githubRepository = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ owner, repo }) => {
        try {
          return await github.repository(owner, repo);
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    githubRepository,
  };
};
