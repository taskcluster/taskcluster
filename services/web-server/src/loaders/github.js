import DataLoader from 'dataloader';

export default ({ github }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const githubRepository = new DataLoader((queries) =>
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

  const renderTaskclusterYml = new DataLoader((queries) =>
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
