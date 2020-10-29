const DataLoader = require('dataloader');
const sift = require('../utils/sift');
const { isNil } = require('ramda');
const { withRootUrl } = require('taskcluster-lib-urls');
const ConnectionLoader = require('../ConnectionLoader');
const Artifact = require('../entities/Artifact');
const Artifacts = require('../entities/Artifacts');

module.exports = ({ queue }, isAuthed, rootUrl, monitor, strategies, req, cfg, requestId) => {
  const urls = withRootUrl(rootUrl);
  const withUrl = ({ method, taskId, artifact, runId }) => {
    const hasRunId = !isNil(runId);

    return {
      ...artifact,
      url: hasRunId
        ? queue.externalBuildSignedUrl(method, taskId, runId, artifact.name)
        : queue.externalBuildSignedUrl(method, taskId, artifact.name),
    };
  };

  const artifact = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, name }) => {
        try{
          const artifact = await queue.getArtifact(taskId, runId, name);

          return new Artifact(
            taskId,
            withUrl({
              method: queue.getArtifact,
              taskId,
              artifact,
              runId,
            }),
            runId,
          );
        } catch (err) {
          return err;
        }
      }),
    ),
  );
  const artifacts = new ConnectionLoader(
    async ({ taskId, runId, filter, options }) => {
      const raw = await queue.listArtifacts(taskId, runId, options);
      const withUrls = raw.artifacts.map(artifact =>
        withUrl({
          method: queue.getArtifact,
          taskId,
          artifact,
          runId,
        }),
      );
      const artifacts = sift(filter, withUrls);

      return new Artifacts(taskId, runId, { ...raw, artifacts });
    },
  );
  const latestArtifacts = new ConnectionLoader(
    async ({ taskId, filter, options }) => {
      const raw = await queue.listLatestArtifacts(taskId, options);
      const withUrls = raw.artifacts.map(artifact =>
        withUrl({
          method: queue.getLatestArtifact,
          taskId,
          artifact,
        }),
      );
      const artifacts = sift(filter, withUrls);

      return new Artifacts(taskId, null, { ...raw, artifacts });
    },
  );

  return {
    artifact,
    artifacts,
    latestArtifacts,
  };
};
