const DataLoader = require('dataloader');

module.exports = ({ github }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
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

  const renderTaskclusterYml = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ payload }) => {
        try {
          return await github.renderTaskclusterYml(payload);
        } catch (err) {
          return err;
        }
      }),
    ),
  );

  return {
    githubRepository,
    renderTaskclusterYml,
  };
};
