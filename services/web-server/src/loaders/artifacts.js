import ConnectionLoader from '../ConnectionLoader.js';
import Artifacts from '../entities/Artifacts.js';

export default ({ queue }, _isAuthed, _rootUrl, _monitor, _strategies, _req, _cfg, _requestId) => {
  const artifacts = new ConnectionLoader(
    async ({ taskId, runId, options }) => {
      const raw = await queue.listArtifacts(taskId, runId, options);

      return new Artifacts(taskId, runId, { ...raw, artifacts: raw.artifacts });
    },
  );
  const latestArtifacts = new ConnectionLoader(
    async ({ taskId, options }) => {
      const raw = await queue.listLatestArtifacts(taskId, options);

      return new Artifacts(taskId, null, { ...raw, artifacts: raw.artifacts });
    },
  );

  return {
    artifacts,
    latestArtifacts,
  };
};
