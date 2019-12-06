const DataLoader = require('dataloader');

module.exports = ({ github }) => {
  const githubRepository = new DataLoader(queries =>
    Promise.all(
      queries.map(({ owner, repo }) => { 
        try {
          return github.repository(owner, repo) 
        } catch (err) {
          return err
        }
      }),
    ),
  );

  return {
    githubRepository,
  };
};
