import DataLoader from 'dataloader';
import sift from 'sift';
import ConnectionLoader from '../ConnectionLoader';
import Artifact from '../entities/Artifact';
import Artifacts from '../entities/Artifacts';

export default ({ queue }, isAuthed) => {
  const withUrl = (taskId, runId, artifact) => {
    const url = isAuthed
      ? queue.buildSignedUrl(queue.getArtifact, taskId, runId, artifact.name)
      : queue.buildUrl(queue.getArtifact, taskId, runId, artifact.name);

    return { ...artifact, url };
  };

  const artifact = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, name }) => {
        const artifact = await queue.getArtifact(taskId, runId, name);

        return new Artifact(taskId, withUrl(taskId, runId, artifact), runId);
      })
    )
  );
  const artifacts = new ConnectionLoader(
    async ({ taskId, runId, filter, options }) => {
      const raw = await queue.listArtifacts(taskId, runId, options);
      const withUrls = raw.artifacts.map(artifact =>
        withUrl(taskId, runId, artifact)
      );
      const artifacts = filter ? sift(filter, withUrls) : withUrls;

      return new Artifacts(taskId, runId, { ...raw, artifacts });
    }
  );
  const latestArtifacts = new ConnectionLoader(
    async ({ taskId, runId, filter, options }) => {
      const raw = await queue.listLatestArtifacts(taskId, runId, options);
      const withUrls = raw.artifacts.map(artifact =>
        withUrl(taskId, runId, artifact)
      );
      const artifacts = filter ? sift(filter, withUrls) : withUrls;

      return new Artifacts(taskId, runId, { ...raw, artifacts });
    }
  );

  return {
    artifact,
    artifacts,
    latestArtifacts,
  };
};
