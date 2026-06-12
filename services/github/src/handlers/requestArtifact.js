import utils from '../utils.js';

export function buildArtifactUrl(queueClient, { taskId, runId, artifactName }) {
  const limitedQueueClient = queueClient.use({ authorizedScopes: [`queue:get-artifact:${artifactName}`] });
  return limitedQueueClient.buildSignedUrl(limitedQueueClient.getArtifact, taskId, runId, artifactName);
}

/**
 * Helper to request artifacts from statusHandler.
 */
export async function requestArtifact(artifactName, { taskId, runId, debug, instGithub, build }) {
  try {
    const url = buildArtifactUrl(this.queueClient, { taskId, runId, artifactName });
    const res = await utils.throttleRequest({ url, method: 'GET' });

    if (res.status >= 400 && res.status !== 404) {
      const requiredScope = `queue:get-artifact:${artifactName}`;
      let errorMessage = `Failed to fetch task artifact \`${artifactName}\` for GitHub integration.\n`;
      switch (res.status) {
        case 403:
          errorMessage = errorMessage.concat(`The GitHub service does not have permission to read this artifact. Make sure the artifact is public or grant the GitHub service the \`${requiredScope}\` scope.`);
          break;
        case 404:
          errorMessage = errorMessage.concat("Make sure the artifact exists, and there are no typos in its name.");
          break;
        case 424:
          errorMessage = errorMessage.concat("Make sure the artifact exists on the worker or other location.");
          break;
        default:
          if (res.response?.error?.message) {
            errorMessage = errorMessage.concat(res.response.error.message);
          }
          break;
      }
      let { organization, repository, sha } = build;
      await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: new Error(errorMessage),
      });

      if (res.status < 500) {
        await this.monitor.reportError(res.response.error);
      }
    } else if (res.status >= 200 && res.status < 300) {
      return res.text.toString();
    }
  } catch (e) {
    await this.monitor.reportError(e);
  }
  return '';
}

export default requestArtifact;
