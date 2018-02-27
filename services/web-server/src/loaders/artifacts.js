import DataLoader from 'dataloader';
import sift from 'sift';
import Artifact from '../entities/Artifact';
import Artifacts from '../entities/Artifacts';

export default ({ queue }, isAuthed) => {
  const createArtifactsConnection = (taskId, runId, filter, artifacts) => {
    const withUrls = artifacts.map(
      artifact =>
        isAuthed
          ? {
              ...artifact,
              url: queue.buildSignedUrl(
                queue.getArtifact,
                taskId,
                runId,
                artifact.name
              ),
            }
          : artifact
    );
    const filtered = filter ? sift(filter, withUrls) : withUrls;

    return new Artifacts(
      taskId,
      null,
      filtered.map(artifact => new Artifact(taskId, artifact, runId))
    );
  };

  const artifact = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, name }) => {
        const artifact = await queue.getArtifact(taskId, runId, name);
        const url =
          isAuthed &&
          queue.buildSignedUrl(queue.getArtifact, taskId, runId, name);

        return new Artifact(taskId, runId, artifact, url);
      })
    )
  );
  const artifacts = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, filter }) => {
        const { artifacts } = await queue.listArtifacts(taskId, runId);

        return createArtifactsConnection(taskId, runId, filter, artifacts);
      })
    )
  );
  const latestArtifacts = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, filter }) => {
        const { artifacts } = await queue.latestArtifacts(taskId);

        return createArtifactsConnection(taskId, null, filter, artifacts);
      })
    )
  );

  return {
    artifact,
    artifacts,
    latestArtifacts,
  };
};
