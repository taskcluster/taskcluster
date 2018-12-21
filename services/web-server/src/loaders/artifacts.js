import DataLoader from 'dataloader';
import sift from 'sift';
import { isNil } from 'ramda';
import { withRootUrl } from 'taskcluster-lib-urls';
import ConnectionLoader from '../ConnectionLoader';
import Artifact from '../entities/Artifact';
import Artifacts from '../entities/Artifacts';

export default ({ queue }, isAuthed, rootUrl) => {
  const urls = withRootUrl(rootUrl);
  const withUrl = ({ method, taskId, artifact, runId }) => {
    const hasRunId = !isNil(runId);
    const isPublic = /^public\//.test(artifact.name);

    // We don't want to build signed URLs for public artifacts,
    // even when credentials are present -- users often
    // copy/paste artifact URLs, and this would likely lead to
    // people copy/pasting time-limited, signed URLs which would
    // (a) have a long ?bewit=.. argument and
    // (b) probably not work after that bewit expires.
    // We could use queue.buildUrl, but this creates URLs where the artifact
    // name has slashes encoded. For artifacts we specifically allow slashes
    // in the name unencoded, as this make things like `wget ${URL}` create
    // files with nice names.
    if (isPublic) {
      return {
        ...artifact,
        url: hasRunId
          ? urls.api(
              'queue',
              'v1',
              `task/${taskId}/runs/${runId}/artifacts/${artifact.name}`
            )
          : urls.api(
              'queue',
              'v1',
              `task/${taskId}/artifacts/${artifact.name}`
            ),
      };
    }

    if (!isPublic && !isAuthed) {
      return {
        ...artifact,
        url: null,
      };
    }

    return {
      ...artifact,
      url: hasRunId
        ? queue.buildSignedUrl(method, taskId, runId, artifact.name)
        : queue.buildSignedUrl(method, taskId, artifact.name),
    };
  };

  const artifact = new DataLoader(queries =>
    Promise.all(
      queries.map(async ({ taskId, runId, name }) => {
        const artifact = await queue.getArtifact(taskId, runId, name);

        return new Artifact(
          taskId,
          withUrl(queue.getArtifact, taskId, artifact, runId),
          runId
        );
      })
    )
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
        })
      );
      const artifacts = filter ? sift(filter, withUrls) : withUrls;

      return new Artifacts(taskId, runId, { ...raw, artifacts });
    }
  );
  const latestArtifacts = new ConnectionLoader(
    async ({ taskId, filter, options }) => {
      const raw = await queue.listLatestArtifacts(taskId, options);
      const withUrls = raw.artifacts.map(artifact =>
        withUrl({
          method: queue.getLatestArtifact,
          taskId,
          artifact,
        })
      );
      const artifacts = filter ? sift(filter, withUrls) : withUrls;

      return new Artifacts(taskId, null, { ...raw, artifacts });
    }
  );

  return {
    artifact,
    artifacts,
    latestArtifacts,
  };
};
